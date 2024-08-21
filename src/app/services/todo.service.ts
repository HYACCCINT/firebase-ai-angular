import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInAnonymously,
  signOut,
  User,
} from '@angular/fire/auth';
import { getApp } from '@angular/fire/app';

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
  Timestamp,
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environments';
import { getVertexAI, getGenerativeModel } from 'firebase/vertexai-preview';

type Priority = 'high' | 'medium' | 'low';

export type Todo = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Timestamp;
  priority: 'none' | 'low' | 'medium' | 'high';
  completed: boolean;
  owner: string;
  createdTime: Timestamp;
  order?: number;
  parentId?: string;
};

const MODEL_CONFIG = {
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
  systemInstruction: `Use this JSON schema: ${JSON.stringify({
    type: 'object',
    properties: {
      mainTask: {
        title: { type: 'string' },
        dueDate: { type: 'timestamp' },
        priority: { type: 'string' },
      },
      subtasks: [
        {
          title: { type: 'string' },
          dueDate: { type: 'timestamp' },
          priority: { type: 'string' },
          order: { type: 'int' },
        },
      ],
    },
  })}`,
};

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private vertexAI = getVertexAI(getApp());
  // Caveat: the VertexAI model may take a while (~10s) to initialize after your
  // first call to GenerateContent(). You may see a PERMISSION_DENIED error before then.
  private prodModel = getGenerativeModel(this.vertexAI, MODEL_CONFIG);

  private genAI = new GoogleGenerativeAI(environment.gemini_api_key);
  private experimentModel = this.genAI.getGenerativeModel(MODEL_CONFIG);

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

  async fileToGenerativePart(file: File) {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(JSON.stringify(reader?.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const result = await base64EncodedDataPromise;
    const chew = JSON.stringify(result).slice(1, -3);
    return {
      inlineData: { data: chew, mimeType: file.type },
    } as any;
  }

  async generateTodoBasedOnPrevious(): Promise<string> {
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
      const result = await this.experimentModel.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Failed to generate todo', error);
      throw error;
    }
  }

  async generateTodoFromImage(
    file: File | null,
    title?: String
  ): Promise<string> {
    if (!file) {
      return '';
    }
    const imagePart = await this.fileToGenerativePart(file);
    const currentDate = new Date();
    const prompt = `Based on the ${
      title ? `title "${title}" and ` : ''
    }image in the input, generate a main task and multiple subtasks in an array that are required to complete this main task. The output should be in the format:
    {
      "mainTask": {
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" }
      },
      "subtasks": [{
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" },
        "order": { "type": "int" }
      }]
    }. The due date should be a reasonable time in the future of ${currentDate}.`;
    try {
      const result = await this.experimentModel.generateContent([
        prompt,
        imagePart,
      ]);

      const response = result.response.text();
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to generate todo', error);
      throw error;
    }
  }

  async generateTodoFromDescription(
    description: String | null,
    title?: String
  ): Promise<string> {
    if (!description) {
      return '';
    }
    const currentDate = new Date();
    const prompt = `Based on the ${
      title ? `title "${title}" and ` : ''
    }description ${description}, generate a main task and multiple subtasks in an array that are required to complete this main task. The output should be in the format:
    {
      "mainTask": {
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" }
      },
      "subtasks": [{
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" },
        "order": { "type": "int" }
      }]
    }. The due date should be a reasonable time in the future of ${currentDate}.`;
    try {
      const result = await this.experimentModel.generateContent(prompt);
      const response = result.response.text();
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to generate todo', error);
      throw error;
    }
  }
  private generateLocalUid(): string {
    return 'local-' + uuidv4();
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

  // async addTodo(todoData: Todo): Promise<void> {
  //   const userId =
  //     this.currentUser?.uid || this.localUid || this.generateLocalUid();

  //   try {
  //     const newTodoRef = doc(collection(this.firestore, 'todos'));
  //     const todo = {
  //       ...todoData,
  //       date: todoData.date,
  //       userId: userId,
  //       timeCreated: Date.now(),
  //       id: newTodoRef.id,
  //     };
  //     await setDoc(newTodoRef, todo);
  //     this.refreshTodos();
  //   } catch (error) {
  //     console.error('Error writing new todo to Firestore', error);
  //   }
  // }

  async addTodo(
    title: string,
    description: string | null,
    dueDate: Timestamp,
    priority: 'none' | 'low' | 'medium' | 'high',
    parentId?: string,
    order?: number
  ): Promise<void> {
    const userId =
      this.currentUser?.uid || this.localUid || this.generateLocalUid();
    try {
      const newTodoRef = doc(collection(this.firestore, 'todos'));
      const todo: Todo = {
        id: newTodoRef.id,
        title: title,
        description: description,
        dueDate: dueDate,
        priority: priority,
        completed: false,
        owner: userId,
        createdTime: Timestamp.fromDate(new Date()),
        order: order || 0,
        parentId: parentId,
      };
      await setDoc(newTodoRef, todo);
      this.refreshTodos();
    } catch (error) {
      console.error('Error writing new todo to Firestore', error);
    }
  }

  async updateTodo(todoData: Todo, id: string): Promise<void> {
    const userId =
      this.currentUser?.uid || this.localUid || this.generateLocalUid();
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
    const userId =
      this.currentUser?.uid || this.localUid || this.generateLocalUid();

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
