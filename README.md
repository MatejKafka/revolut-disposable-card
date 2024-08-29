# Revolut Disposable Card Viewer

A small utility to print information about the current Revolut disposable card. I use it whenever I want to pay with the disposable card and I'm too lazy to open the Revolut app on my phone. Written in TypeScript.

# Usage

Run `index.ts` using Bun:

```sh
> bun index.ts
The phone number will be stored at `./revolut.json`. PIN is not stored.
Phone number: +000xxxxxxxxx
PIN: ******

xxxx xxxx xxxx xxxx
xx/xx
xxx
```

Config containing your phone number, ID of the first disposable card and a Revolut API access token is stored in `revolut.json` in the current working directory. On the first run, you will be prompted for your phone number and your PIN. On subsequent runs, you only need to enter the PIN.