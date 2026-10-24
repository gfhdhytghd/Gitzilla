# QR encoder

`qrcode.cjs` is the unmodified `qrcode.js` from **qrcode-generator 1.4.4**, by Kazuhiko Arase, distributed under the MIT license (notice retained at the top of the file).

Upstream: https://github.com/kazuhikoarase/qrcode-generator

Package source: https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-1.4.4.tgz

Verified npm SHA-512 integrity: `sha512-HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==`

Vendored to avoid adding a runtime npm dependency. Our wrapper feeds UTF-8 bytes and draws SVG paths from the module matrix with a four-module quiet zone.
