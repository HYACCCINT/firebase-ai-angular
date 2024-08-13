# This nix config is only for building the template itself
{ pkgs, ... }: {
  channel = "unstable";
  # Enable the IDX Template CLI
  packages = [
    pkgs.python3
  ];
  idx.internal.templates-cli.enable = true;
}