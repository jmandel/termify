#!/bin/bash

for i in {26..100}; do
  num=$(printf "%03d" $i)  # zero-pad the number
  npm run termify "patient cannot recognize faces" > samples/output.$num.json
done
