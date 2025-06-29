#!/bin/bash

jsdoc -r index.js -d docs
jsdoc -r ./source/js -d docs

chmod +x generate-doc.sh
