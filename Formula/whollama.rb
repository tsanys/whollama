class Whollama < Formula
  desc "Find the best Ollama model for your hardware, ranked by real benchmarks"
  homepage "https://github.com/tsanys/whollama"
  # npm release tarball — URL pattern is stable across versions.
  url "https://registry.npmjs.org/@tsany/whollama/-/whollama-0.3.0.tgz"
  # Refresh on every release: `npm view @tsany/whollama@<version> dist.shasum`
  # then `brew audit --new whollama && brew test whollama`.
  sha256 "1f5ff6b2128db2de10b804ee9c2166e654390155"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "curated", shell_output("#{bin}/whollama --offline --json --top 1")
  end
end
