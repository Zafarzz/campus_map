"""Operational scripts.

A package rather than loose files so that ``from scripts.db_backup import main``
works (``db_restore.py --self-test`` relies on it) and so mypy resolves each file
under exactly one module name.

Every script here is runnable directly as well: each inserts the backend
directory onto ``sys.path`` before importing ``app``.
"""
