#!/bin/sh
# Generates a throwaway CA and the three certificates the spike needs.
set -e
mkdir -p certs && cd certs
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout ca-key.pem -out ca.pem -days 30 -subj "/CN=spike-ca" 2>/dev/null
mk() { # name common-name extended-key-usage
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$1-key.pem" -out "$1.csr" -subj "/CN=$2" 2>/dev/null
  printf "subjectAltName=DNS:%s\nextendedKeyUsage=%s\n" "$2" "$3" > "$1.ext"
  openssl x509 -req -in "$1.csr" -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
    -out "$1.pem" -days 30 -extfile "$1.ext" 2>/dev/null
  rm "$1.csr" "$1.ext"
}
mk observatory observatory.test serverAuth
mk engine engine.test serverAuth
mk client observatory-client clientAuth
