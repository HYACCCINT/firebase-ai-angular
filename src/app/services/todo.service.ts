import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInAnonymously,
  signOut,
  User,
} from '@angular/fire/auth';
import { Observable, BehaviorSubject, of } from 'rxjs';
import {
  doc,
  Firestore,
  setDoc,
  collection,
  deleteDoc,
  collectionData,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environments';

type Priority = 'high' | 'medium' | 'low';

export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  date: Date;
  time: string;
  completed: boolean;
  flagged: boolean;
  priority: Priority;
};

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private genAI = new GoogleGenerativeAI(environment.gemini_api_key);
  private model = this.genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  user$ = authState(this.auth);
  private todosSubject = new BehaviorSubject<Todo[]>([]);
  todos$ = this.todosSubject.asObservable(); // Observable for components to subscribe to
  currentUser: User | null = null;
  private localUid: string | null = null;

  constructor() {
    this.user$.subscribe((user: User | null) => {
      this.currentUser = user;
      if (user) {
        // User is authenticated
        this.localUid = user.uid;
      } else {
        // User is not authenticated
        if (!this.localUid) {
          this.localUid = this.generateLocalUid();
        }
      }
      this.loadTodos().subscribe((todos) => {
        this.todosSubject.next(todos);
      });
    });

    this.login();
  }

  private generateLocalUid(): string {
    return 'local-' + uuidv4();
  }

  async generateTodo(): Promise<string> {
    const activeTodos = this.todosSubject
      .getValue()
      .filter((todo) => !todo.completed);
    console.log('activeTodos', activeTodos);
    const prompt = `provide a suggested todo that someone ${
      activeTodos.length > 0
        ? `should follow up after completing this todo ${JSON.stringify(
            activeTodos[0]
          )}`
        : `creating a todo list today might want to do`
    } using this JSON schema: { "type": "object", "properties": { "title": { "type": "string" }, "description": { "type": "string" }, "priority": { "type": "string" }, } }`;
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Failed to generate todo', error);
      throw error;
    }
  }

  login(): void {
    signInAnonymously(this.auth).catch((error) => {
      console.error('Anonymous login failed:', error);
      // Continue without authentication, relying on the local UID
    });
  }

  logout(): void {
    signOut(this.auth)
      .then(() => {
        console.log('Signed out');
      })
      .catch((error) => console.error('Sign out error:', error));
  }

  loadTodos(): Observable<Todo[]> {
    const todoQuery = query(
      collection(this.firestore, 'todos'),
      orderBy('timeCreated', 'desc')
    );

    return collectionData(todoQuery, { idField: 'id' }) as Observable<Todo[]>;
  }

  async addTodo(todoData: Todo): Promise<void> {
    const userId = this.currentUser?.uid || this.localUid || this.generateLocalUid();

    try {
      const newTodoRef = doc(collection(this.firestore, 'todos'));
      const todo = {
        ...todoData,
        date: todoData.date,
        userId: userId,
        timeCreated: Date.now(),
        id: newTodoRef.id,
      };
      await setDoc(newTodoRef, todo);
      this.refreshTodos();
    } catch (error) {
      console.error('Error writing new todo to Firestore', error);
    }
  }

  async updateTodo(todoData: Todo, id: string): Promise<void> {
    const userId = this.currentUser?.uid || this.localUid || this.generateLocalUid();
    if (!userId) {
      console.log('updateTodo requires a user ID');
      return;
    }

    try {
      const todo = { ...todoData, userId: userId };
      await setDoc(doc(this.firestore, 'todos', id), todo);
      this.refreshTodos();
    } catch (error) {
      console.error('Error updating todo in Firestore', error);
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const userId = this.currentUser?.uid || this.localUid || this.generateLocalUid();

    try {
      await deleteDoc(doc(this.firestore, 'todos', id));
      this.refreshTodos();
    } catch (error) {
      console.error('Error deleting todo from Firestore', error);
    }
  }

  private refreshTodos(): void {
    this.loadTodos().subscribe((todos) => {
      this.todosSubject.next(todos);
    });
  }
}
