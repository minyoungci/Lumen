from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from app.schemas.kanban_column import KanbanColumnOut


class KanbanBoardOut(BaseModel):
    columns: List[KanbanColumnOut] = Field(default_factory=list)
