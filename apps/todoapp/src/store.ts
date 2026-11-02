export type Todo = { id: number; title: string; done: boolean };

const todos: Todo[] = [];
let nextId = 1;

export function listTodos(): Todo[] {
  return todos;
}

export function addTodo(title: string): Todo {
  const todo: Todo = { id: nextId++, title, done: false };
  todos.push(todo);
  return todo;
}
