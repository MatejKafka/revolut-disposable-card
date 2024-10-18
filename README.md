# Revolut Disposable Card Viewer

A small utility to print information about the current Revolut disposable card. I use it whenever I want to pay with the disposable card and I'm too lazy to open the Revolut app on my phone. Written in TypeScript.

# Usage

Run the project using Bun, or by downloading the pre-compiled release binaries:

```sh
> bun .
Authentication tokens will be stored at `...\revolut.json`.
Phone number and PIN are not stored.

No previous session found. Signing in...
Phone number: +000xxxxxxxxx
PIN: ******

Please confirm the sign-in in your Revolut mobile app...

xxxx xxxx xxxx xxxx
xx/xx
xxx
```

```sh
> bun .
PIN: ******

xxxx xxxx xxxx xxxx
xx/xx
xxx
```

Config file containing the Revolut API tokens and a UUID of the first disposable card is stored in `revolut.json` in the current working directory. On the first run, you will be prompted for your phone number and your PIN. On subsequent runs, you only need to enter the PIN.

To debug the program, pass `DEBUG` as an argument (`bun . DEBUG`) and all network requests and responses will be printed to stderr.
