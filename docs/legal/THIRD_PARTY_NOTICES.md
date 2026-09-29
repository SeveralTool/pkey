# Third-Party Notices

The copyright lines below are required by third-party licenses and are reproduced unchanged. PKEY includes open-source and third-party software. The following is a **non-exhaustive** summary of major components. Full machine-generated list: [THIRD_PARTY_NOTICES.generated.md](./THIRD_PARTY_NOTICES.generated.md) (`npm run legal:notices` before each store AAB).

## Application dependencies (mobile)

| Component | License | Notice |
|-----------|---------|--------|
| [React](https://react.dev/) | MIT | Copyright Meta Platforms, Inc. |
| [React Native](https://reactnative.dev/) | MIT | Copyright Meta Platforms, Inc. |
| [Expo](https://expo.dev/) | MIT | Copyright 2015-present 650 Industries, Inc. |
| [React Navigation](https://reactnavigation.org/) | MIT | Copyright React Navigation contributors |
| [crypto-es](https://github.com/entronad/crypto-es) | MIT | Copyright entronad |
| [aes-js](https://github.com/ricmoo/aes-js) | MIT | Copyright Richard Moore |
| [zxcvbn](https://github.com/dropbox/zxcvbn) | MIT | Copyright Dropbox, Inc. |
| [@react-native-async-storage/async-storage](https://github.com/react-native-async-storage/async-storage) | MIT | Copyright Facebook, Inc. |
| [phc-winner-argon2](https://github.com/P-H-C/phc-winner-argon2) | CC0-1.0 or Apache-2.0 | Vendored C in `pkey-crypto` iOS |
| [expo-local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/) | MIT | Copyright 650 Industries, Inc. |
| [react-native-tcp-socket](https://github.com/Rapsssito/react-native-tcp-socket) | MIT | Copyright Rapsssito |
| [react-native-zeroconf](https://github.com/balthazar/react-native-zeroconf) | MIT | Copyright Balthazar Rouberol |
| [selfsigned](https://github.com/jfromaniello/selfsigned) | MIT | Copyright Jose F. Romaniello |
| [pako](https://github.com/nodeca/pako) | MIT | Copyright 2014-2017 Vitaly Puzrin and Andrei Tuputcyn |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Copyright 2020 Walker Williams |

## Web client (`@pkey/web-client`)

| Component | License | Notice |
|-----------|---------|--------|
| [Solid.js](https://www.solidjs.com/) | MIT | Copyright SolidJS contributors |
| [Vite](https://vitejs.dev/) | MIT | Copyright Evan You and Vite contributors |

## Runtime third-party network services (user-triggered)

When enabled by the user, the application or the local-network web client may request:

- Site icons from external hosts (the saved site host name is sent)
- An optional public breach-prefix lookup (a short password-hash prefix only; not the password)

These services are operated by third parties under their own terms. The in-app Third-Party Notices screen reproduces the same summary.

## Full license texts

MIT and similar licenses require reproducing copyright notices. Include the full text of each applicable license in:

- This document (expanded section below), or
- An in-app **Open Source Licenses** screen, or
- A bundled `licenses/` directory in the app package

### MIT License (representative)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

This file reproduces third-party copyright notices required by their licenses. The source-code license for this repository is in [LICENSE](../../LICENSE).
