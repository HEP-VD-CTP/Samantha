
# install python dependencies
pip3 install -r src-python/requirements.txt --break-system-packages
pip3 install pyinstaller --break-system-packages

# build python executable
rm -rf src-python/build src-python/dist
pyinstaller --onedir src-python/main.py --distpath src-python/dist --workpath src-python/build


# install node dependencies
npm install

# build electron app
rm -rf dist/electron
quasar build -m electron

# copy python executable to electron app
cp -r src-python/dist/main dist/electron/UnPackaged/main

# repackage electron app
npx electron-packager dist/electron/UnPackaged Samantha --platform=darwin --out=dist/electron/Packaged --overwrite

