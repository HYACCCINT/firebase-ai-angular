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
import { Router } from '@angular/router';
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
  private router = inject(Router);
  private genAI = new GoogleGenerativeAI(environment.gemini_api_key);
  private model = this.genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  user$ = authState(this.auth);
  private todosSubject = new BehaviorSubject<Todo[]>([]);
  todos$ = this.todosSubject.asObservable(); // Observable for components to subscribe to
  currentUser: User | null = null;

  constructor() {
    this.user$.subscribe((user: User | null) => {
      this.currentUser = user;
      if (user) {
        this.loadTodos().subscribe((todos) => {
          this.todosSubject.next(todos);
        });
      } else {
        this.todosSubject.next([]); // Clear todos when user logs out
      }
    });
  }

  async generateTodo(): Promise<string> {
    const activeTodos = this.todosSubject
      .getValue()
      .filter((todo) => !todo.completed);
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
    signInAnonymously(this.auth).then((result) => {
        this.router.navigate(['/', 'todo']);
        return;
      })
      .catch((error) => console.error('Login error:', error));
  }

  logout(): void {
    signOut(this.auth)
      .then(() => {
        this.router.navigate(['/', 'login']);
        console.log('Signed out');
      })
      .catch((error) => console.error('Sign out error:', error));
  }

  loadTodos(): Observable<Todo[]> {
    if (!this.currentUser) {
      return of([]); // Return an empty observable if no user is signed in
    }

    const todoQuery = query(
      collection(this.firestore, this.currentUser.uid),
      orderBy('timeCreated', 'desc')
    );

    return collectionData(todoQuery, { idField: 'id' }) as Observable<Todo[]>;
  }

  async addTodo(todoData: Todo): Promise<void> {
    if (!this.currentUser) {
      console.log('addTodo requires a signed-in user');
      return;
    }

    try {
      const newTodoRef = doc(collection(this.firestore, this.currentUser.uid));
      const todo = {
        ...todoData,
        date: todoData.date,
        userId: this.currentUser.uid,
        timeCreated: Date.now(),
        id: newTodoRef.id,
      };
      await setDoc(newTodoRef, todo);
      this.refreshTodos();
    } catch (error) {
      console.error('Error writing new todo to Firebase Database', error);
    }
  }

  async updateTodo(todoData: Todo, id: string): Promise<void> {
    if (!this.currentUser) {
      console.log('updateTodo requires a signed-in user');
      return;
    }

    try {
      const todo = { ...todoData, userId: this.currentUser.uid };
      await setDoc(doc(this.firestore, this.currentUser.uid, id), todo);
      this.refreshTodos();
    } catch (error) {
      console.error('Error updating todo to Firebase Database', error);
    }
  }

  async deleteTodo(id: string): Promise<void> {
    if (!this.currentUser) {
      console.log('deleteTodo requires a signed-in user');
      return;
    }

    try {
      await deleteDoc(doc(this.firestore, this.currentUser.uid, id));
      this.refreshTodos();
    } catch (error) {
      console.error('Error deleting todo from Firebase Database', error);
    }
  }

  private refreshTodos(): void {
    this.loadTodos().subscribe((todos) => {
      this.todosSubject.next(todos);
    });
  }
}
