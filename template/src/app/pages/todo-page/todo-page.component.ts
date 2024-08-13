import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Todo, TodoService } from '../../services/todo.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AsyncPipe, CommonModule } from '@angular/common';
import { filter, switchMap } from 'rxjs/operators';
import { User } from '@angular/fire/auth';
import { Timestamp } from '@angular/fire/firestore'; // Import Timestamp from Firestore

@Component({
  selector: 'app-todo-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatButtonModule,
    MatMenuModule,
    MatChipsModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatIconModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
    MatSelectModule,
    MatCheckboxModule,
    AsyncPipe,
  ],
  templateUrl: './todo-page.component.html',
  styleUrls: ['./todo-page.component.scss'],
})
export class TodoPageComponent implements OnInit {
  taskForm!: FormGroup;
  showEditor = false;
  selectedTaskId: string | null = null;
  todos: Todo[] = [];
  hasGeneratedInitialTask = false; // Flag to track if the initial task generation has occurred

  constructor(
    public todoService: TodoService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadTodosAndGenerateTask();
  }

  initForm(): void {
    const datetime = new Date();
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      date: [datetime, Validators.required], // Keep date as Date object for the form
      time: [
        datetime.toLocaleString('en-GB', { timeZone: 'UTC' }).slice(-8, -3),
        Validators.required,
      ],
      description: [''],
      flagged: [true],
      priority: ['low', Validators.required],
      completed: [false],
    });
  }

  loadTodosAndGenerateTask(): void {
    this.todoService.user$.pipe(
      filter((user: User | null) => !!user), // Ensure user is authenticated
      switchMap(() => this.todoService.todos$)
    ).subscribe({
      next: (todos: any[]) => {
        this.todos = todos.map(todo => {
          const date = this.parseFirestoreTimestamp(todo.date);
          return {
            ...todo,
            date: date ? this.formatDate(date) : 'Invalid Date'
          };
        });

        if (this.todos.length === 0 && !this.hasGeneratedInitialTask) {
          // Generate task only if no todos are loaded and we haven't generated the initial task yet
          this.hasGeneratedInitialTask = true; // Set the flag to prevent repeated generation
          this.generateTask();
        }
      },
      error: (error: any) => {
        console.error('Error loading todos or user state:', error);
        this.snackBar.open('Error loading data', 'Close', { duration: 3000 });
      },
    });
  }

  async generateTask(): Promise<void> {
    try {
      const generatedDataString = await this.todoService.generateTodo();
      const generatedTodo = JSON.parse(generatedDataString);
      const datetime = new Date();
      this.taskForm.patchValue({
        title: generatedTodo.title,
        date: datetime, // Use Date object for form processing
        time: datetime.toLocaleString('en-GB', { timeZone: 'UTC' }).slice(-8, -3),
        description: generatedTodo.description,
        flagged: generatedTodo.flagged || false,
        priority: generatedTodo.priority.toLowerCase(),
        completed: false,
      });
      this.openEditor();
    } catch (error) {
      console.error('Failed to generate todo', error);
      this.snackBar.open('Failed to generate todo', 'Close', { duration: 3000 });
    }
  }

  submit(): void {
    if (this.taskForm.invalid) {
      return;
    }

    if (this.selectedTaskId) {
      this.updateTask();
    } else {
      this.createTask();
    }
  }

  updateTask(): void {
    if (this.selectedTaskId) {
      this.todoService.updateTodo(this.taskForm.value, this.selectedTaskId);
      this.resetForm();
    }
  }

  updateComplete(todo: Todo): void {
    const updated = { ...todo, completed: !todo.completed };
    this.todoService.updateTodo(updated, todo.id);
  }

  createTask(): void {
    this.todoService.addTodo(this.taskForm.value);
    this.resetForm();
  }

  openEditor(task: Todo | null = null): void {
    if (task) {
      this.selectedTaskId = task.id;
      this.taskForm.patchValue(task);
    }
    this.showEditor = true;
  }

  closeEditor(): void {
    this.resetForm();
  }

  deleteTask(task: Todo): void {
    if (task?.id) {
      this.todoService.deleteTodo(task.id);
    }
  }

  private resetForm(): void {
    this.selectedTaskId = null;
    this.showEditor = false;
    const datetime = new Date();
    this.taskForm.reset({
      title: '',
      date: datetime, // Keep Date object for form
      time: datetime.toLocaleString('en-GB', { timeZone: 'UTC' }).slice(-8, -3),
      description: '',
      flagged: true,
      priority: 'low',
      completed: false,
    });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { // Format date to mm/dd/yyyy for display
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  private parseFirestoreTimestamp(timestamp: any): Date | null {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    return null;
  }
}
