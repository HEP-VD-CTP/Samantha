
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

# remove unnecessary files
rm -rf dist/electron/Packaged/Samantha-darwin-arm64/LICENSE
rm -rf dist/electron/Packaged/Samantha-darwin-arm64/LICENSES.chromium.html
rm -rf dist/electron/Packaged/Samantha-darwin-arm64/version

# remove the quarantine attribute
xattr -cr dist/electron/Packaged/Samantha-darwin-arm64/Samantha.app

# create a .pkg installer
pkgbuild --root dist/electron/Packaged/Samantha-darwin-arm64 \
         --identifier ch.hepl.samantha \
         --version 1.0.0 \
         --install-location /Applications dist/electron/Packaged/Samantha-macos.pkg
