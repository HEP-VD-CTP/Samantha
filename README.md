# <img src="public/favicon-16x16.png" alt="App Icon" width="20"/> Samantha – A Video Anonymization Tool for Education 

> **Note:** ⚠️ Samantha is under active development. 
Pre-built binaries and installation instructions will be provided soon. 
For now, advanced users can build from source. ⚠️

**Samantha** is a privacy-preserving video anonymization app designed specifically for educators and researchers. It enables the secure use of classroom video data while complying with strict legal and ethical standards. 

This anonymization software was developed at the University of Teacher Education, Vaud (HEP Vaud), to facilitate the ethical and secure handling of sensitive data used in research and educational projects. It enables the automatic anonymization of video files by removing or pseudonymizing personally identifiable information, while ensuring traceability and reproducibility of the applied processes.

Designed to meet the specific needs of the academic environment, the tool emphasizes ease of use, process transparency, and compliance with current ethical and legal standards, including data protection regulations (GDPR, Swiss FADP).

The development of this software is part of a broader commitment to responsible research and open knowledge sharing, offering a free, adaptable, and sustainable solution to the educational community.

## Why Samantha?

The use of video in education and research is growing, but privacy concerns and legal requirements often prevent the use of valuable recordings. Manual anonymization is time-consuming and error-prone, and commercial solutions are often expensive or not tailored to academic needs. Samantha addresses these challenges by providing a free, open source, and easy-to-use tool for anonymizing video content.

## Features

- **Automatic Face and Object Detection:** Uses state-of-the-art deep learning models (YOLO, FastSAM, Big-Lama) for robust detection in real-world classroom scenarios.
- **Flexible Anonymization:** Supports both blurring and inpainting (removal) of faces and objects.
- **Manual Review:** Allows users to review and adjust detected objects before anonymization.
- **Privacy by Design:** Ensures compliance with GDPR, Swiss FADP, and other data protection laws.
- **Cross-Platform:** Runs on macOS (Apple Silicon), <u>with planned support for Windows and Linux.</u>
- **Open Source:** Freely available for adaptation and improvement by the educational and research community.

## How It Works

1. **Project Creation:** Start a new project and select a video for anonymization.
2. **Video Trimming:** Optionally trim the video to focus on relevant segments.
3. **Detection:** Automatically detect faces and objects in each frame using deep learning.
4. **Review:** Manually review and select which objects to anonymize.
5. **Anonymization:** Apply blurring or inpainting to selected regions.
6. **Export:** Save the anonymized video for safe use in research or teaching.

## Architecture

- **Frontend:** Electron app built with Quasar Framework (Vue.js + TypeScript) for an intuitive user interface.
- **Backend:** Python server using FastAPI, PyTorch, OpenCV, and ffmpeg for detection and anonymization.
- **Communication:** Real-time WebSocket protocol between frontend and backend for responsive feedback and control.

## Installation



### Pre-built Binaries

Pre-built binaries for macOS are available in the [Releases](https://github.com/HEP-VD-CTP/Samantha/releases) section of this repository.  
Download the latest `.pkg` file for easy installation on your Mac.

> **Note:**  
> Samantha requires a recent Mac with **Apple Silicon (M1, M2, or newer)** and **at least 16GB of RAM** for optimal performance.  
> Older Intel-based Macs won't work.

> **Note:** If you encounter a security warning when opening the app, please refer to the [official Apple instructions](https://support.apple.com/en-gb/guide/mac-help/mh40616/mac) for opening apps from unidentified developers.

### Run for development (MacOS)

**Prerequisites**

- Node.js and npm
- Python 3.9+

1. Clone the repository:
```sh
git clone https://github.com/HEP-VD-CTP/Samantha
cd samantha
```

2. Install Node and Python dependencies:
```sh
npm install
npm install -g @quasar/cli
pip install -r src-python/requirements.txt
```

3. Build the Electron app for development:
```sh
quasar dev -m electron
```

4. Run the Python backend (from another terminal):
```sh
python3 src-python/main.py
```

### Build for production

On MacOS:
```sh
./build_macos.sh
```

## Contributing

Contributions are welcome! Please open issues or pull requests to suggest features, report bugs, or improve documentation.

## License

This project is licensed under the GNU Lesser General Public License v3.0.

