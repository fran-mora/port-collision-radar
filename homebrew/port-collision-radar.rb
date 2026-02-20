# Homebrew Cask formula for Port Collision Radar
#
# To use with a personal tap (fran-mora/homebrew-tap):
#   brew tap fran-mora/homebrew-tap
#   brew install --cask port-collision-radar
#
# Update the url and sha256 for each release.

cask "port-collision-radar" do
  version "1.0.0"
  sha256 "REPLACE_WITH_ACTUAL_SHA256"

  url "https://github.com/fran-mora/port-collision-radar/releases/download/v#{version}/Port.Collision.Radar-#{version}-universal.dmg"
  name "Port Collision Radar"
  desc "macOS menubar app that monitors listening TCP ports and detects collisions"
  homepage "https://github.com/fran-mora/port-collision-radar"

  app "Port Collision Radar.app"

  zap trash: [
    "~/Library/Application Support/port-collision-radar",
    "~/Library/Preferences/com.franmora.port-collision-radar.plist",
  ]
end
