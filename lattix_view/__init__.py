"""lattix-view: a 3D viewer for every lattice lattix reads, as a tab of the lattix workbench or on
its own.  The scene payload (``scene_view``) places a model per element on the survey frames
lattix computes; the page draws them with three.js."""
from lattix_view._version import DIST_NAME, __version__

__all__ = ["DIST_NAME", "__version__"]
