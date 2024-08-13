import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import {
  doc,
  DocumentReference,
  Firestore,
  setDoc,
  collection,
  deleteDoc,
  collectionData,
  query,
  orderBy,
  DocumentData,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../environments/environments';

type Priority = 'high' | 'medium' | 'low';

export type Todo = {
  title: string;
  description?: string | null;
  date: any;
  time: number;
  completed: boolean;
  flagged: boolean;
  priority: Priority;
};

@Injectable({
  providedIn: 'root',
})
export class TodoService {
  firestore: Firestore = inject(Firestore);
  auth: Auth = inject(Auth);
  router: Router = inject(Router);
  private genAI = new GoogleGenerativeAI(environment.gemini_api);
  private model = this.genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });
  private provider = new GoogleAuthProvider();

  // observable that is updated when the auth state changes
  user$ = authState(this.auth);
  currentUser: User | null = this.auth.currentUser;
  userSubscription: Subscription;
  todos: any[] = [];

  constructor() {
    this.userSubscription = this.user$.subscribe((aUser: User | null) => {
      this.currentUser = aUser;
    });
    this.loadTodos().subscribe((res: any[]) => {
      this.todos = res.map(todo => {
        return {...todo, date: new Date(todo.date)}
      })
    });
  }

  generateTodo = async (todos: any) => {
    const prompt = `generate a todo based on ${
      todos.length > 0
        ? `tasks that should follow after these existing todos ${JSON.stringify(
            todos
          )}`
        : `a random todo`
    } using this JSON schema:
  { "type": "object",
    "properties": {
      "title": { "type": "string" },
      "description": { "type": "string" },
      "priority": { "type": "string" },
    }
  }`;
    let result = await this.model.generateContent(prompt);
    return result.response.text();
  };

  login() {
    signInWithPopup(this.auth, this.provider).then((result) => {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      this.router.navigate(['/', 'todo']);
      return credential;
    });
  }

  logout() {
    signOut(this.auth)
      .then(() => {
        this.router.navigate(['/', 'login']);
        console.log('signed out');
      })
      .catch((error) => {
        console.log('sign out error: ' + error);
      });
  }

  // Reads user's todos.
  loadTodos = () => {
    if (!this.currentUser) {
      return;
    }
    // Create the query to load the last 12 messages and listen for new ones.
    const todoquery = query(
      collection(this.firestore, this.currentUser.uid),
      orderBy('timeCreated', 'desc')
    );
    // Start listening to the query.
    return collectionData(todoquery);
  };

  // Add a todo to Cloud Firestore.
  addTodo = async (
    todoData: Todo
  ): Promise<void | DocumentReference<DocumentData>> => {
    if (this.currentUser == null) {
      console.log('addTodo requires a signed-in user');
      return;
    }
    const date = todoData.date.toDateString();
    console.log(date, "date");
    try {
      const newTodoRef = doc(collection(this.firestore, this.currentUser.uid));
      const todo = {
        ...todoData,
        date: date,
        userId: this.currentUser.uid,
        timeCreated: Date.now(),
        id: newTodoRef.id,
      };
      return await setDoc(newTodoRef, todo);
    } catch (error) {
      console.error('Error writing new todo to Firebase Database', error);
      return;
    }
  };

  updateTodo = async (
    todoData: any,
    id: string
  ): Promise<void | DocumentReference<DocumentData>> => {
    if (this.currentUser === null) {
      console.log('updateTodo requires a signed-in user');
      return;
    }
    
    try {
      const date = todoData.date.toDateString();
      const todo = { ...todoData, date: date, userId: this.currentUser.uid };
      const newTodoRef = await setDoc(
        doc(this.firestore, this.currentUser.uid, id),
        todo
      );
      return newTodoRef;
    } catch (error) {
      console.error('Error updating todo to Firebase Database', error);
      return;
    }
  };

  deleteTodo = async (
    id: string
  ): Promise<void | DocumentReference<DocumentData>> => {
    if (this.currentUser === null) {
      console.log('deleteTodo requires a signed-in user');
      return;
    }
    return await deleteDoc(doc(this.firestore, this.currentUser.uid, id));
  };
}
