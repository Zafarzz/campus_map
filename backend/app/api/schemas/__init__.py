"""Response and request models.

Two families live here and they must not be merged:

* ``campus`` - the **clean** API. Free to evolve, carries ``source`` and
  ``confidence`` on anything computed.
* ``compat`` - the **compatibility** API. Mirrors the front end's TypeScript
  types byte for byte. Changing a field name here breaks the map.
"""
