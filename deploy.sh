#!/bin/bash

TIMEOUT=5
MEM=512MB

gcloud functions deploy solve --runtime python37 --trigger-http --timeout $TIMEOUT --memory $MEM --project minesweepr
