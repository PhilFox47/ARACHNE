# When the Docker build hangs or fails

Everything in this file is about **the machine's network**, not about ARACHNE. The symptoms all
look like an application bug and none of them are one, which is what makes them expensive.

## The tell

Docker's outbound HTTPS is unreliable on this host. Three separate failures, all the same cause:

| Symptom | Where |
|---|---|
| `failed to fetch oauth token: Post "https://auth.docker.io/token": net/http: TLS handshake timeout` | Step 3, before the Dockerfile is parsed |
| `npm ci` prints its warnings in 4 s, then hangs for 10+ minutes with no output | `prebuild-install` fetching from **github.com** |
| A build that "worked before" suddenly takes minutes | Cache miss, so the network is on the critical path again |

The common thread: **the npm registry being fast tells you nothing.** Each of these talks to a
*different host*, and on a broken connection some hosts work and others hang at the TLS handshake.

## Check it in thirty seconds

```powershell
# Docker Hub's auth endpoint — the one that fails at step 3.
docker run --rm node:22-slim node -e "fetch('https://auth.docker.io/token?service=registry.docker.io').then(r=>console.log('dockerhub',r.status)).catch(e=>console.log('dockerhub FAILED',e.message))"

# GitHub — where prebuild-install fetches native binaries from.
docker run --rm node:22-slim node -e "fetch('https://github.com').then(r=>console.log('github',r.status)).catch(e=>console.log('github FAILED',e.message))"

# The npm registry, for contrast. This one usually works, which is the trap.
docker run --rm node:22-slim node -e "fetch('https://registry.npmjs.org/next').then(r=>console.log('npm',r.status)).catch(e=>console.log('npm FAILED',e.message))"
```

Anything that hangs rather than answering is the problem.

## Fixes, in the order worth trying

**1. MTU.** By far the most common cause on Windows, and it produces exactly this signature — small
requests succeed, TLS handshakes hang, because the handshake's certificate exchange is the first
thing large enough to need fragmenting. A VPN, WSL2 or a corporate network can all leave the MTU
wrong. In Docker Desktop → Settings → Docker Engine, add:

```json
{
  "mtu": 1400
}
```

Apply & restart. If it helps but not completely, try 1350 or 1280.

**2. VPN.** Disconnect and rebuild. If that fixes it, the VPN is either rewriting MTU or intercepting
TLS, and the MTU setting above is usually the permanent answer.

**3. Antivirus doing TLS inspection.** Kaspersky, ESET, Bitdefender and Avast all offer HTTPS
scanning that Docker's Go TLS stack does not tolerate. Exclude Docker or turn the feature off.

**4. DNS.** In the same Docker Engine settings:

```json
{
  "mtu": 1400,
  "dns": ["1.1.1.1", "8.8.8.8"]
}
```

**5. Restart Docker Desktop.** Sometimes the VM's networking is simply wedged, and this clears it.
Worth trying first because it is free, but if it keeps coming back the answer is MTU.

## What the Dockerfile does to survive it

None of this fixes the network, but it removes as much dependence on it as possible:

- **No `# syntax=` directive.** That line makes BuildKit resolve a tag against Docker Hub on every
  build, needing an auth token before the file is even read — the exact call that fails at step 3.
  Docker's built-in frontend does everything used here.
- **`npm_config_build_from_source=true`.** better-sqlite3's installer fetches from github.com using
  a client with no timeout, so an unreachable GitHub hangs forever with no output. Building from
  source routes through node-gyp instead, which times out and fails loudly.
- **`nodedir` points at the image's own node headers**, so node-gyp does not fetch them from
  nodejs.org either. Between this and the two above, the native build reaches no host at all.
- **The npm and node-gyp caches are mounted**, so a rebuild does not re-fetch what it already has.
- **The dependency layer is keyed on `package-lock.json` alone**, so a release that only bumps the
  version reuses it and touches the network not at all.

## Once it builds

The image is self-contained. Nothing at runtime reaches Docker Hub, GitHub or npm — the only
outbound call ARACHNE makes is to Nano-GPT, when a meal photo is analysed.

## Reading a stalled `npm ci`

`--foreground-scripts` is on, so install scripts print as they run. That gives you a way to tell
where it is:

```
#17 ...  npm warn deprecated ...            ← downloading. Fast, and not where it hangs.
#17 ...  > better-sqlite3@11.10.0 install   ← scripts have started
#17 ...  > prebuild-install || node-gyp rebuild --release
#17 ...  gyp info it worked if it ends with ok
#17 ...  gyp info spawn /usr/local/bin/python3   ← compiling, ~2 min, quiet while it works
```

- **Stalls with only `npm warn` lines showing** — it has not reached the scripts. Extraction, or a
  fetch that is still open.
- **Stalls right after `> better-sqlite3 ... install`** — the install script is blocked on the
  network. This is what `build_from_source` and `nodedir` exist to prevent.
- **Stalls after `gyp info spawn python3`** — that one is fine. It is compiling and says nothing
  until it finishes.
