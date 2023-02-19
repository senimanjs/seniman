#!/bin/bash

rm -r ../app-templates

cp -r ../../../examples ../app-templates

cd ../ && npm publish && cd scripts/

rm -r ../app-templates

ln -s ../../examples app-templates