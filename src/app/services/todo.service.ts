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
  where,
  updateDoc,
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environments';
import { getVertexAI, getGenerativeModel } from 'firebase/vertexai-preview';

type Priority = 'none' | 'low' | 'medium' | 'high';

export type Todo = {
  id: string;
  title: string;
  dueDate: Timestamp;
  priority?: Priority; // Optional: only for main tasks
  completed: boolean;
  owner: string;
  createdTime: Timestamp;
  order?: number;
  parentId?: string; // Required for subtasks
};

export type TaskWithSubtasks = {
  mainTask: Todo;
  subtasks: Todo[];
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
  public todosSubject = new BehaviorSubject<Todo[]>([]);
  todos$ = this.todosSubject.asObservable(); // Observable for components to subscribe to
  currentUser: User | null = null;
  public localUid: string | null = null;

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

  async generateMainTodo(): Promise<any> {
    const activeTodos = this.todosSubject
      .getValue()
      .filter((todo) => !todo.completed);
    const prompt = `provide a major task that someone ${
      activeTodos.length > 0
        ? `might do the day after relating to cthis todo ${JSON.stringify(
            activeTodos[0].title
          )}`
        : `creating a todo list today might want to do in a friendly tone`
    } using this JSON schema: { "type": "object", "properties": { "title": { "type": "string" }, "description": { "type": "string" }, "priority": { "type": "string" }, } }`;
    try {
      const result = await this.experimentModel.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (error) {
      console.error('Failed to generate todo', error);
      throw error;
    }
  }

  createTaskRef(id?: string) {
    const taskCollection = collection(this.firestore, 'todos');
    return id ? doc(taskCollection, id) : doc(taskCollection); // Firestore generates ID if not provided
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

  async generateTodoFromImage(
    file: File | null,
    title?: String
  ): Promise<any> {
    if (!file) {
      return {
        mainTask: null,
        subTasks: []
      };
    }
    const imagePart = await this.fileToGenerativePart(file);
    const currentDate = new Date();
    const prompt = `Based on the ${
      title ? `title "${title}" but more importantly in regards to the ` : ''
    }image in the input, generate a main task and multiple subtasks in an array that are required to complete this main task, put emphasis on the image. The output should be in the format:
    {
      "mainTask": {
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" }
      },
      "subTasks": [{
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
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
  ): Promise<any> {
    if (!description) {
      return {
        mainTask: null,
        subTasks: []
      };
    }
    const currentDate = new Date();
    const prompt = `Based on the ${
      title ? `title "${title}" and ` : ''
    }description ${description}, generate a main task and multiple subtasks in an array that are required to complete this main task, put emphasis on the description. The output should be in the format:
    {
      "mainTask": {
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
        "priority": { "type": "string" }
      },
      "subTasks": [{
        "title": { "type": "string" },
        "dueDate": { "type": "timestamp" },
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
      orderBy('createdTime', 'desc')
    );
  
    console.log("Executing query...");
  
    return collectionData(todoQuery, { idField: 'id' }) as Observable<Todo[]>;
  }
  

  async addMainTaskWithSubtasks(
    mainTask: Omit<Todo, 'id'>,
    subtasks: Omit<Todo, 'id'>[]
  ): Promise<void> {
    const userId = this.currentUser?.uid || this.localUid || this.generateLocalUid();
  
    try {
      // Add the main task
      const mainTaskRef = doc(collection(this.firestore, 'todos'));
      const newMainTask: Todo = {
        ...mainTask,
        id: mainTaskRef.id,
        owner: userId,
        createdTime: Timestamp.fromDate(new Date()),
      };
      await setDoc(mainTaskRef, newMainTask);
      // Add each subtask individually
      for (const [index, subtask] of subtasks.entries()) {
        const subtaskRef = doc(collection(this.firestore, 'todos'));
        const newSubtask: Todo = {
          ...subtask,
          id: subtaskRef.id,
          owner: userId,
          createdTime: Timestamp.fromDate(new Date()),
          parentId: mainTaskRef.id,
          order: index,
        };
        await setDoc(subtaskRef, newSubtask);
      }
  
      // Refresh todos after adding
      this.refreshTodos();
    } catch (error) {
      console.error('Error adding main task and subtasks to Firestore', error);
    }
  }
  
  async deleteMainTaskAndSubtasks(mainTaskId: string): Promise<void> {
    try {
      // First, load the subtasks for the main task
      const subtasksObservable = await this.loadSubtasks(mainTaskId);
  
      subtasksObservable.subscribe(async (subtasks) => {
        // Delete each subtask individually
        for (const subtask of subtasks) {
          const subtaskRef = doc(this.firestore, 'todos', subtask.id);
          await deleteDoc(subtaskRef);
        }
  
        // Delete the main task after deleting its subtasks
        const mainTaskRef = doc(this.firestore, 'todos', mainTaskId);
        await deleteDoc(mainTaskRef);
  
        // Refresh the task list after deletion
        this.refreshTodos();
      });
    } catch (error) {
      console.error('Error deleting main task and subtasks from Firestore', error);
    }
  }
  
  
async updateTodoAndSubtasks(mainTask: Todo, subtasks: Todo[]): Promise<void> {
  try {
    // Update the main task
    const mainTaskRef = doc(this.firestore, 'todos', mainTask.id);
    await setDoc(mainTaskRef, mainTask, { merge: true });

    // Update each subtask individually
    for (const subtask of subtasks) {
      const subtaskRef = doc(this.firestore, 'todos', subtask.id);
      await setDoc(subtaskRef, subtask, { merge: true });
    }
  } catch (error) {
    console.error('Error updating/deleting tasks and subtasks', error);
    throw error;
  }
}
  // Update subtask title
  async updateSubtaskTitle(subtask: Todo): Promise<void> {
    const subtaskRef = doc(this.firestore, 'todos', subtask.id);
    await updateDoc(subtaskRef, { title: subtask.title });
  }

  // Delete a subtask
  async deleteSubtask(subtaskId: string): Promise<void> {
    const subtaskRef = doc(this.firestore, 'todos', subtaskId);
    await deleteDoc(subtaskRef);
  }

  // Update subtask order
  async updateSubtaskOrder(subtasks: Todo[]): Promise<void> {
    for (const subtask of subtasks) {
      const subtaskRef = doc(this.firestore, 'todos', subtask.id);
      await updateDoc(subtaskRef, { order: subtask.order });
    }
  }


  async loadSubtasks(mainTaskId: string): Promise<Observable<Todo[]>> {
    const subtaskQuery = query(
      collection(this.firestore, 'todos'),
      where('parentId', '==', mainTaskId)
    );
    return await collectionData(subtaskQuery, { idField: 'id' });
  }

  async addSubtask(subtask: Todo): Promise<void> {
    try {
      const subtaskRef = doc(this.firestore, 'todos', subtask.id);
      await setDoc(subtaskRef, subtask);
    } catch (error) {
      console.error('Error adding subtask', error);
      throw error;
    }
  }
  
  async addTodo(
    title: string,
    dueDate: Timestamp,
    completed: boolean,
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
        dueDate: dueDate,
        completed: completed,
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
