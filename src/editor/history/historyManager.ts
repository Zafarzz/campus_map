import type { EditorDocument } from '../domain/types';
import type { EditorCommand } from './commands';

export class HistoryManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private maxDepth: number;

  constructor(maxDepth: number = 60) {
    this.maxDepth = maxDepth;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  get lastAction(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].description : null;
  }

  push(command: EditorCommand): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    // Any new action clears redo stack
    this.redoStack = [];
  }

  undo(currentDoc: EditorDocument): { doc: EditorDocument; description: string } | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    const newDoc = cmd.undo(currentDoc);
    this.redoStack.push(cmd);
    return { doc: newDoc, description: cmd.description };
  }

  redo(currentDoc: EditorDocument): { doc: EditorDocument; description: string } | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    const newDoc = cmd.execute(currentDoc);
    this.undoStack.push(cmd);
    return { doc: newDoc, description: cmd.description };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
