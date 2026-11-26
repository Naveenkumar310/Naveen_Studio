#!/bin/zsh
# Double-click in Finder to start your local Studio.
cd "${0:A:h}" || exit 1
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
    print 'My Studio requires Node.js 22 or later. Install Node, then run this launcher again.'
    read '?Press Enter to close…'
    exit 1
fi
if [ ! -d node_modules ]; then
    npm install --cache "${TMPDIR:-/tmp}/my-studio-npm-cache" || exit 1
fi
if curl -fsS http://127.0.0.1:5173/api/workspaces >/dev/null 2>&1; then
    open http://127.0.0.1:5173/
    print 'My Studio is already running at http://127.0.0.1:5173/'
    exit 0
fi
(sleep 3; open http://127.0.0.1:5173/) &
print 'My Studio is starting. Keep this Terminal window open. Press Control-C to stop.'
npm run dev
