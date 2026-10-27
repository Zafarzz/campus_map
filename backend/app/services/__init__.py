"""Service layer: the only place that reads and writes the domain.

Routers translate HTTP to service calls and back; services own the queries and
the rules. Keeping them separate is what lets the compatibility layer be a thin
projection rather than a second implementation (``AGENTS.md`` rule 4 forbids
duplicate subsystems), and it is what the LLM assistant's tools will call in a
later phase - never raw SQL.
"""
