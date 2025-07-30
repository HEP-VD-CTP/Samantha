
rm -rf dist
rm -rf src-python/build

# install node dependencies
npm install

# build electron app
quasar build -m electron

# install python dependencies
pip3 install -r src-python/requirements.txt --break-system-packages
pip3 install pyinstaller --break-system-packages

# build python executable
pyinstaller --onedir src-python/main.py --distpath dist/electron/UnPackaged --workpath src-python/build

# repackage electron app
npx electron-packager dist/electron/UnPackaged Samantha --platform=darwin --out=dist/electron/Packaged --overwrite  --icon=src-electron/icons/icon.png

