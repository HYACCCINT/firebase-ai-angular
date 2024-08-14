# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "unstable"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.firebase-tools
    pkgs.terraform
    pkgs.nodejs
  ];

  # Sets environment variables in the workspace
  env = {
    GOOGLE_PROJECT = "<project-id>";
    CLOUDSDK_CORE_PROJECT = "<project-id>";
    TF_VAR_project = "<project-id>";
    # Flip to true to help improve Angular
    NG_CLI_ANALYTICS = "false";
  };

  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "hashicorp.terraform"
      "angular.ng-template"
    ];

    # Enable previews
    previews = {
      enable = true;
      previews = {
        web = {
          command = [
            "ng"
            "serve"
            "--port"
            "$PORT"
          ];

          manager = "web";
        };
      };
    };

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        terraform = ''
          terraform init --upgrade
          terraform apply --auto-approve
        '';
        npm-install = "npm install";
      };
      # Runs when the workspace is (re)started
      onStart = {
        npm-start = "npm start";
      };
    };
  };
}
