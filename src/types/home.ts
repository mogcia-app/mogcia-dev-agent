export interface HomeQuickTodo {
  id: string;
  content: string;
  dueDate: string | null;
  completed: boolean;
}

export interface HomeWorkspace {
  currentWork: string;
  remember: string;
  todos: HomeQuickTodo[];
  updatedAt: string | null;
}
