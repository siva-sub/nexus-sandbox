{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.python312
    pkgs.python312Packages.pip
    pkgs.postgresql_16
    pkgs.redis
    pkgs.libxml2
    pkgs.libxslt
    pkgs.gcc
  ];
}
