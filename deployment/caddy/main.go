package main

import (
	_ "time/tzdata"

	_ "github.com/caddy-dns/cloudflare"
	caddycmd "github.com/caddyserver/caddy/v2/cmd"
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() {
	caddycmd.Main()
}
