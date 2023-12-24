if [ "${PWD##*/}" != "seniman" ]; then
  echo "Please run this script from the packages/seniman folder"
  exit 1
fi

# this script will publish the package to npm
rm -r tmp 

# create a tmp folder to store the whole npm package, containing README.md, LICENSE, dist folder, and package.json
mkdir tmp

# copy the README.md and LICENSE to the tmp folder
cp ../../README.md tmp
cp ../../LICENSE tmp

# copy the dist folder to the tmp folder
cp -r dist tmp

# copy the package.json to the tmp folder
cp package.json tmp

# change directory to the tmp folder
cd tmp

# publish the package to npm
npm publish

# remove the tmp folder
cd ..
rm -rf tmp

echo "Published to npm"