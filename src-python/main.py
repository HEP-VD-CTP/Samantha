from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLO, RTDETR, FastSAM, SAM
import cv2
import torch
import numpy as np
from PIL import Image
import asyncio
import uvicorn
import json
import gc
import os
import subprocess
import random
import time

print("Starting AI worker...") 
app = FastAPI()

# device selection
device = (
  'cuda' if torch.cuda.is_available()
  else 'mps' if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()
  else 'cpu'
)
print(f"Device detected: {device}")


last_frame_sent_time = 0  
async def send_throttled_frame(ws, frame, min_interval=0.25):
  """
  Send the frame via websocket only if at least min_interval seconds have passed since the last send.
  """
  global last_frame_sent_time
  now = time.time()
  if now - last_frame_sent_time < min_interval:
    return  # Skip sending this frame
  try:
    await ws.send_bytes(compress_and_resize_frame(frame))
    last_frame_sent_time = now
  except Exception as e:
    print(f"Failed to send frame: {e}")
    raise  

  await asyncio.sleep(0)

def compress_and_resize_frame(frame, max_size=1024, quality=60):
  """
  Resize the frame to max 1024px width (landscape) or 1024px height (portrait)
  then compress to JPEG with the given quality
  Returns JPEG bytes
  """
  # Get original dimensions
  h, w = frame.shape[:2]
  # Determine scaling factor
  if w >= h and w > max_size:
    scale = max_size / w
  elif h > w and h > max_size:
    scale = max_size / h
  else:
    scale = 1.0
  # Resize if needed
  if scale != 1.0:
    new_w, new_h = int(w * scale), int(h * scale)
    frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
  # Encode as JPEG with specified quality
  encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
  success, jpeg = cv2.imencode('.jpg', frame, encode_param)
  if not success:
    raise RuntimeError("Could not encode frame as JPEG")
  return jpeg.tobytes()

async def detect(ws, workspace, file, classes):
  # models path
  yolov12_l_path = os.path.join(workspace, 'models', 'yolov12l.pt')
  yolov11_l_face_path = os.path.join(workspace, 'models', 'yolov11l-face.pt')

  # Object detection model
  model_object = YOLO(yolov12_l_path)
  model_object.to(device)

  # face detection model
  model_face = YOLO(yolov11_l_face_path)
  model_face.to(device)
  # ByteTrack config file from ultralytics
  tracker_cfg = 'bytetrack.yaml' 

  # video loop
  cap = cv2.VideoCapture(file)
  if not cap.isOpened():
    print("Error opening video file")
    exit()

  # holds every detection for every frame
  detections_per_frame = []

  while True:
    ok, frame = cap.read()
    if not ok:
      break

    # hold every detection for this frame
    frame_detections = []
    
    # Face detection + tracking
    results_face = model_face.track(frame, persist=True, conf=0.25, tracker=tracker_cfg)

    #results_face = await results_face
    boxes_face = results_face[0].boxes
    if boxes_face is not None:
      for xyxy, conf, cls, tid in zip(boxes_face.xyxy.cpu().numpy(), boxes_face.conf.cpu().numpy(), boxes_face.cls.cpu().numpy(),(boxes_face.id.cpu().numpy() if boxes_face.id is not None else [-1]*len(boxes_face))):
        x1, y1, x2, y2 = map(int, xyxy)
        if tid == -1:
          tid = -random.randint(10000, 99999)
        detection = {
          "id": int(tid),
          "cid": -1, # we set the classid to -1 for face detection
          "cname": "face",  
          "pos": { "x1": x1, "y1": y1, "x2": x2, "y2": y2 }
        }
        frame_detections.append(detection)
    
    # objects detection + tracking
    results = model_object.track(frame, persist=True, conf=0.25, tracker=tracker_cfg)

    #results = await results 
    boxes = results[0].boxes   # ultralytics Results object
    if boxes is not None:
      # xyxy, confidence, class, track_id are all tensors; move to CPU & numpy
      for xyxy, conf, cls, tid in zip(boxes.xyxy.cpu().numpy(), boxes.conf.cpu().numpy(), boxes.cls.cpu().numpy(), (boxes.id.cpu().numpy() if boxes.id is not None else [-1]*len(boxes))):
        x1,y1,x2,y2 = map(int, xyxy)
        if tid == -1:
          tid = -random.randint(10000, 99999)
        detection = {
          "id": int(tid),
          "cid": int(cls),
          "cname": model_object.names[int(cls)],
          "pos": { "x1": x1, "y1": y1, "x2": x2, "y2": y2}
        }
        frame_detections.append(detection)

    # Append current frame detections to the list
    detections_per_frame.append(frame_detections)

    # draw the bouding boxes
    for detection in frame_detections:
      # do not draw classes not in the selected list
      if classes is not None and detection['cid'] not in classes:
        continue 

      det = detection["pos"]
      label = f"{detection['cname']} {detection['id']}"
      color = (0, 255, 0)
      cv2.rectangle(frame, (det["x1"], det["y1"]), (det["x2"], det["y2"]), color, 2)
      cv2.putText(frame, label, (det["x1"], det["y1"]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # send image to client
    await send_throttled_frame(ws, frame)
     

  cap.release()
  cv2.destroyAllWindows()
  cv2.waitKey(1)
  del model_object
  del model_face
  gc.collect()
  if torch.cuda.is_available():
    torch.cuda.empty_cache()
  if torch.backends.mps.is_available():
    torch.mps.empty_cache()
  print("Detection done.")

  return detections_per_frame

def get_image(image):
  if isinstance(image, Image.Image):
    img = np.array(image)
  elif isinstance(image, np.ndarray):
    img = image.copy()
  else:
    raise Exception("Input image should be either PIL Image or numpy array!")

  if img.ndim == 3:
    img = np.transpose(img, (2, 0, 1))  # chw
  elif img.ndim == 2:
    img = img[np.newaxis, ...]

  assert img.ndim == 3

  img = img.astype(np.float32) / 255
  return img


def ceil_modulo(x, mod):
  if x % mod == 0:
    return x
  return (x // mod + 1) * mod


def scale_image(img, factor, interpolation=cv2.INTER_AREA):
  if img.shape[0] == 1:
    img = img[0]
  else:
    img = np.transpose(img, (1, 2, 0))

  img = cv2.resize(img, dsize=None, fx=factor, fy=factor, interpolation=interpolation)

  if img.ndim == 2:
    img = img[None, ...]
  else:
    img = np.transpose(img, (2, 0, 1))
  return img

def pad_img_to_modulo(img, mod):
  channels, height, width = img.shape
  out_height = ceil_modulo(height, mod)
  out_width = ceil_modulo(width, mod)
  return np.pad(
    img,
    ((0, 0), (0, out_height - height), (0, out_width - width)),
    mode="symmetric",
  )

def prepare_img_and_mask(image, mask, device, pad_out_to_modulo=8, scale_factor=None):
  out_image = get_image(image)
  out_mask = get_image(mask)

  if scale_factor is not None:
    out_image = scale_image(out_image, scale_factor)
    out_mask = scale_image(out_mask, scale_factor, interpolation=cv2.INTER_NEAREST)

  if pad_out_to_modulo is not None and pad_out_to_modulo > 1:
    out_image = pad_img_to_modulo(out_image, pad_out_to_modulo)
    out_mask = pad_img_to_modulo(out_mask, pad_out_to_modulo)

  out_image = torch.from_numpy(out_image).unsqueeze(0).to(device)
  out_mask = torch.from_numpy(out_mask).unsqueeze(0).to(device)

  out_mask = (out_mask > 0) * 1

  return out_image, out_mask

async def anonymize(ws, workspace, target_folder, file, detections_list):
  # video loop
  cap = cv2.VideoCapture(file)
  if not cap.isOpened():
    print("Error opening video file")
    exit()

  # sam model
  sam = SAM(os.path.join(workspace, 'models', 'mobile_sam.pt'))
  sam.to(device)
  fast_sam = FastSAM(os.path.join(workspace, 'models', 'FastSAM-x.pt'))
  fast_sam.to(device)

  # inpainting model
  model_inpainting = torch.jit.load(os.path.join(workspace, 'models', 'big-lama.pt'), map_location=device)
  model_inpainting.eval()
  model_inpainting.to(device)

  # initialize video writer
  frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
  fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # or 'XVID', 'avc1', etc.
  fps = cap.get(cv2.CAP_PROP_FPS)
  width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
  height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
  out_video_path = os.path.join(target_folder, "final.mp4")
  out = cv2.VideoWriter(out_video_path, fourcc, fps, (width, height))

  print(f"video frame count: {frame_count}, fps: {fps}, width: {width}, height: {height}")
  print(f"Detections count: {len(detections_list)}  ")

  
  while True:
    ok, frame = cap.read()
    if not ok:
      break

    # send clear image to client
    await send_throttled_frame(ws, frame)

    # skip if no blurring or inpainting 
    detections = detections_list.pop(0)
    for detection in detections:
      if not detection['blur'] and not detection['inpaint']:
        continue
          
      # Get bounding box
      x1, y1, x2, y2 = map(int, [
          detection['pos']['x1'],
          detection['pos']['y1'], 
          detection['pos']['x2'], 
          detection['pos']['y2']
        ]
      )
      # --- FastSAM mask ---
      results_fast = fast_sam(frame, bboxes=[x1, y1, x2, y2], device=device)
      if isinstance(results_fast, list):
        results_fast = results_fast[0]

      mask_fast = None
      if results_fast.masks is not None:
        masks_np_fast = results_fast.masks.data.cpu().numpy()
        if masks_np_fast.shape[0] > 0:
          mask_fast = masks_np_fast[0]
          if mask_fast.shape != frame.shape[:2]:
            mask_fast = cv2.resize(mask_fast, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_NEAREST)

      # --- SAM mask ---
      results_sam = sam(frame, bboxes=[x1, y1, x2, y2], device=device)
      if isinstance(results_sam, list):
        results_sam = results_sam[0]

      mask_sam = None
      if results_sam.masks is not None:
        masks_np_sam = results_sam.masks.data.cpu().numpy()
        if masks_np_sam.shape[0] > 0:
          mask_sam = masks_np_sam[0]
          if mask_sam.shape != frame.shape[:2]:
            mask_sam = cv2.resize(mask_sam, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_NEAREST)

      # --- Combine masks ---
      if mask_fast is not None and mask_sam is not None:
        mask = np.logical_or(mask_fast > 0.1, mask_sam > 0.1).astype(np.float32)
      elif mask_fast is not None:
        mask = (mask_fast > 0.1).astype(np.float32)
      elif mask_sam is not None:
        mask = (mask_sam > 0.1).astype(np.float32)
      else:
        continue  # No valid mask found

      if detection['blur']:
        mask_bool = mask > 0.1  
        blurred = cv2.GaussianBlur(frame, (151, 151), 0)
        frame[mask_bool] = blurred[mask_bool]
      
      elif detection['inpaint']:
        # Make the mask binary and dilate for stronger anonymization
        mask_bin = (mask > 0.1).astype(np.uint8) * 255
        kernel = np.ones((21, 21), np.uint8)  # You can increase for more coverage
        mask_bin = cv2.dilate(mask_bin, kernel, iterations=1)
        # Feather the mask edges for smoother inpainting
        mask_bin = cv2.GaussianBlur(mask_bin, (15, 15), 0)

        # Convert frame and mask to PIL Images
        frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        mask_pil = Image.fromarray(mask_bin)

        # Prepare tensors for LaMa
        img_tensor, mask_tensor = prepare_img_and_mask(frame_pil, mask_pil, device)

        with torch.inference_mode():
          inpainted = model_inpainting(img_tensor, mask_tensor)
          inpainted_np = inpainted[0].permute(1, 2, 0).detach().cpu().numpy()
          inpainted_np = np.clip(inpainted_np * 255, 0, 255).astype(np.uint8)

        inpainted_bgr = cv2.cvtColor(inpainted_np, cv2.COLOR_RGB2BGR)
        frame[mask_bin > 0] = inpainted_bgr[mask_bin > 0]  

      # send filtered image to client
      await send_throttled_frame(ws, frame)

    # write the frame to the output video
    out.write(frame)
    
    if cv2.waitKey(1) == 27:   # ESC
      break

  
  # add the audio to the video as it has no audio track yet
  out.release() # start by releasing the video writer

  # encode to a temporary video file
  temp_path = os.path.join(target_folder, "temp_final.mp4")
  cmd = [
      "ffmpeg", "-y",
      "-i", out_video_path,
      "-i", file,
      "-map", "0:v:0",
      "-map", "1:a:0",
      #"-t", str((frame_count - 2) / fps),  # Remove the last 2 frames if the video as they don't include detections
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      temp_path
  ]
  subprocess.run(cmd, check=True)
  os.replace(temp_path, out_video_path)

  # release resources
  cap.release()
  cv2.destroyAllWindows()
  cv2.waitKey(1)
  del fast_sam
  del model_inpainting
  gc.collect()
  if torch.cuda.is_available():
    torch.cuda.empty_cache()
  if torch.backends.mps.is_available(): 
    torch.mps.empty_cache()
  print("Anonymization.")

# endpoint for object detection
@app.websocket("/detect")
async def detect_endpoint(ws: WebSocket):
  await ws.accept()
  print("Detection ws connection established.")

  try:
    # Receive the first message with context informations
    data = await ws.receive_text()
    data = json.loads(data)
    print("Received data:", data)

    workspace = data.get("workspace")
    file = data.get("file")
    classes = data.get("classes")

    detections_per_frame = await detect(ws=ws, workspace=workspace, file=file, classes=classes) 

    print("Detection finished.")
    await ws.send_text(json.dumps({ "status": "done", "detections": detections_per_frame }))
    
    await ws.close()
  except WebSocketDisconnect as e:
    print(f"WebSocket disconnected, stopping detection: {e}")
  except Exception as e:
    print("Detection error:", e)
    await ws.close()

# endpoint for object detection
@app.websocket("/anonymize")
async def detect_endpoint(ws: WebSocket):
  await ws.accept()
  print("Anonymization ws connection established.")

  try:
    # Receive the first message with context informations
    data = await ws.receive_text()
    data = json.loads(data)

    workspace = data.get("workspace")
    file = data.get("file")
    detections = data.get("detections")
    name = data.get("name")
    target_folder = os.path.join(workspace, 'projects', name)
    
    final_file = os.path.join(target_folder, "final.mp4")
    if os.path.exists(final_file):
      os.remove(final_file)

    # Call the anonymization function
    await anonymize(ws=ws, workspace=workspace, target_folder=target_folder, file=file, detections_list=detections)
    await asyncio.sleep(3)  # wait 3 seconds to ensure the video has fully been processed
    await ws.send_text(json.dumps({ "status": "done" }))
    print("Anonymization finished.")

    await ws.close()
  except WebSocketDisconnect as e:
    print(f"WebSocket disconnected, stopping anonymization: {e}")
    raise
  except Exception as e:
    print("Anonymization error:", e)
    await ws.close()

if __name__ == "__main__": 
  uvicorn.run("main:app", host="0.0.0.0", port=3000, ws_ping_interval=1, ws_ping_timeout=3600, ws_max_size=100 * 1024 * 1024 * 1024)
