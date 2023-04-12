#!/bin/bash

rm -r ../app-templates

# delete all node_modules folders within the examples folder
find ../../../examples -name "node_modules" -type d -exec rm -r {} \;
find ../../../examples -name "dist" -type d -exec rm -r {} \;

cp -r ../../../examples ../app-templates

cd ../ && npm publish && cd scripts/

rm -r ../app-templates