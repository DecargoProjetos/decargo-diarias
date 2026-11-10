# A single, pinned libc/graphics closure. Never combine arbitrary store paths.
let
  pkgs = import (builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/650e572363c091045cdbc5b36b0f4c1f614d3058.tar.gz";
    sha256 = "sha256-pzrVLKRQNPrii06Rm09Q0i0dq3wt2t2pciT/GNq5EZQ=";
  }) { system = "x86_64-linux"; };
  roots = with pkgs; [
    glibc patchelfUnstable nss nspr atk at-spi2-atk at-spi2-core cups dbus systemd
    libdrm libxkbcommon mesa libgbm alsa-lib gtk3 gtk4 glib pango
    harfbuzzFull gdk-pixbuf cairo icu74 libxml2 sqlite libxslt lcms2
    libevent libopus flite libwebp libavif libepoxy libjpeg8 libpng
    libmanette enchant2 libsecret hyphen graphene vulkan-loader x264
    stdenv.cc.cc.lib
    xorg.libX11 xorg.libxcb xorg.libXrandr xorg.libXcomposite xorg.libXcursor
    xorg.libXdamage xorg.libXi xorg.libXext xorg.libXfixes xorg.libXrender
    gst_all_1.gstreamer gst_all_1.gst-plugins-base gst_all_1.gst-plugins-bad
  ];
  # Include only the dependencies of these pinned roots, not the host store.
  # Downloaded WebKit libraries also need transitive system libraries directly.
  closure = pkgs.closureInfo { rootPaths = roots; };
  dependencies = builtins.filter (p: p != "" && builtins.pathExists "${p}/lib")
    (pkgs.lib.splitString "\n" (builtins.readFile "${closure}/store-paths"));
in pkgs.buildEnv {
  name = "correction-browser-runtime";
  paths = roots ++ dependencies;
  pathsToLink = [ "/lib" "/bin" "/share/glvnd" ];
  extraOutputsToInstall = [ "out" "lib" ];
  ignoreCollisions = true;
}
