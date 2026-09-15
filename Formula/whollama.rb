class Whollama < Formula
  desc "Find the best Ollama model for your hardware, ranked by real benchmarks"
  homepage "https://github.com/tsanys/whollama"
  # npm release tarball — URL pattern is stable across versions.
  url "https://registry.npmjs.org/@tsany/whollama/-/whollama-0.2.0.tgz"
  # Refresh on every release: `npm view @tsany/whollama@<version> dist.shasum`
  # then `brew audit --new whollama && brew test whollama`.
  sha256 "28d041f70e4c16bb17bcdae16d8f8f1e24e30d07"
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
