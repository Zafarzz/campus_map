"""Real-time delivery: WebSocket topics with a cross-worker fan-out.

Three pieces:

* :mod:`.events` - the JSON envelope every message uses.
* :mod:`.broker` - publish/subscribe, over Redis when configured and in-process
  otherwise.
* :mod:`.hub` - the per-instance connection manager.

The design constraint that shapes all of it (brief section 8): the API runs
behind **more than one worker**, and a client connected to worker A must receive
an event published by worker B. A connection manager alone cannot do that - it
only knows its own process - so every publish goes through the broker and comes
back to each instance's hub.

Redis is optional. With ``REDIS_URL`` unset the broker degrades to an in-process
bus, which is correct for a single worker and honest about its limits: it logs
once that cross-worker fan-out is unavailable rather than silently dropping
messages a second worker would have needed.
"""

from app.realtime.broker import Broker, get_broker
from app.realtime.events import Envelope, EventType, Topic
from app.realtime.hub import Hub, get_hub

__all__ = [
    "Broker",
    "Envelope",
    "EventType",
    "Hub",
    "Topic",
    "get_broker",
    "get_hub",
]
