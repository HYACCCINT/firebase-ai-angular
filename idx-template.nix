{ pkgs, projectId, ... }:
{
  bootstrap = ''
    mkdir -p "$out"
    cp -rf ${./template}/. "$out"
    chmod -R +w "$out"

    # Apply project ID to configs
    sed -e 's/<project-id>/${projectId}/' ${./template/.idx/dev.nix} > "$out/.idx/dev.nix"
  '';
}