import {
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { CommonModule, AsyncPipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject, filter, switchMap, tap } from 'rxjs';
import { Todo, TodoService } from './services/todo.service';

@Component({
  selector: 'app-root',
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
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  taskForm!: FormGroup;
  showEditor = false;
  selectedTaskId: string | null = null;
  todos: Todo[] = [];
  subtasks: { todo: Todo; editing: boolean }[] = []; // List of subtasks with editing state
  showDescriptionInput = false;
  descriptionInput = '';

  imageName = signal('');
  fileSize = signal(0);
  uploadProgress = signal(0);
  imagePreview = signal('');
  @ViewChild('fileInput') fileInput: ElementRef | undefined;
  selectedFile: File | null = null;
  uploadSuccess: boolean = false;
  uploadError: boolean = false;

  constructor(
    public todoService: TodoService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadTodos();
  }

  initForm(): void {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      dueDate: ['', Validators.required],
      priority: ['none', Validators.required],
      completed: [false],
      flagged: [false],
    });
  }

  loadTodos(): void {
    this.todoService.loadTodos().subscribe((todos) => {
      console.log("Fetched todos: ", todos); // Log the fetched todos
      this.todoService.todosSubject.next(todos); // Update the subject in the service
      this.todoService.todos$
        .pipe(
          tap((todos) => {
            if (Array.isArray(todos)) {
              this.todos = todos.map((todo: any) => {
                const date = this.parseFirestoreTimestamp(todo.dueDate);
                return {
                  ...todo,
                  dueDate: date ? this.formatDate(date) : 'Invalid Date',
                };
              });
              console.log("Formatted todos: ", this.todos); // Log the formatted todos
            }
          })
        )
        .subscribe({
          next: (todos) => {
            if (Array.isArray(todos)) {
              this.todos = todos.map((todo: any) => {
                const date = this.parseFirestoreTimestamp(todo.dueDate);
                return {
                  ...todo,
                  dueDate: date ? this.formatDate(date) : 'Invalid Date',
                };
              });
              console.log("Final todos list: ", this.todos); // Log the final todos
            }
          },
          error: (error) => {
            console.error('Error loading todos:', error);
            this.snackBar.open('Error loading data', 'Close', {
              duration: 3000,
            });
          },
        });
    });
  }
  
  
  

  openEditor(task: Todo | null = null): void {
    this.showEditor = true;
    if (task) {
      this.selectedTaskId = task.id;
      this.taskForm.patchValue(task);
      this.loadSubtasks(task.id);
    } else {
      this.selectedTaskId = null;
    }
  }

  closeEditor(): void {
    this.showEditor = false;
    this.resetForm();
    
  }

  loadSubtasks(mainTaskId: string): void {
    this.todoService.loadSubtasks(mainTaskId).then((subtasks) => {
      this.subtasks = subtasks.map((todo) => ({ todo, editing: false }));
    });
  }

  editSubtask(subtask: { todo: Todo; editing: boolean }): void {
    subtask.editing = true;
  }

  saveSubtaskTitle(subtask: { todo: Todo; editing: boolean }): void {
    subtask.editing = false;
  }

  deleteSubtask(subtask: { todo: Todo; editing: boolean }): void {
    this.subtasks = this.subtasks.filter(
      (st) => st.todo.id !== subtask.todo.id
    );
  }

  moveSubtaskUp(subtask: { todo: Todo; editing: boolean }): void {
    const index = this.subtasks.findIndex(
      (st) => st.todo.id === subtask.todo.id
    );
    if (index > 0) {
      [this.subtasks[index], this.subtasks[index - 1]] = [
        this.subtasks[index - 1],
        this.subtasks[index],
      ];
      this.updateSubtaskOrder();
    }
  }

  moveSubtaskDown(subtask: { todo: Todo; editing: boolean }): void {
    const index = this.subtasks.findIndex(
      (st) => st.todo.id === subtask.todo.id
    );
    if (index < this.subtasks.length - 1) {
      [this.subtasks[index], this.subtasks[index + 1]] = [
        this.subtasks[index + 1],
        this.subtasks[index],
      ];
      this.updateSubtaskOrder();
    }
  }

  updateSubtaskOrder(): void {
    this.subtasks.forEach((subtask, index) => {
      subtask.todo.order = index;
    });
  }

  generateTaskFromDescription(): void {
    this.todoService
      .generateTodoFromDescription(this.descriptionInput)
      .then((generatedTodo) => {
        this.subtasks = this.subtasks.concat(
          generatedTodo.subtasks.map((todo: any) => ({ todo, editing: false }))
        );
      });
  }

  generateMainTask(): void {
    this.todoService
      .generateMainTodo()
      .then((generatedTask) => {
        const newTaskRef = this.todoService.createTaskRef();
        const newTask: Todo = {
          id: newTaskRef.id,
          title: generatedTask.title,
          dueDate: Timestamp.fromDate(new Date()),
          completed: false,
          owner:
            this.todoService.currentUser?.uid || this.todoService.localUid!,
          createdTime: Timestamp.fromDate(new Date()),
          priority: generatedTask.priority,
        };
        this.loadTodos();
        this.openEditor(newTask);
      })
      .catch((error) => {
        console.error('Failed to generate main task', error);
      });
  }

  async onFileChange(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    const title = this.taskForm.get('title')?.value; // Get the current task title
    await this.generateTaskFromImage(file, title); // Pass the title
  }

  async generateMainWithSubTaskFromImage(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) {
      return;
    }
  
    try {
      const generatedTodo = await this.todoService.generateTodoFromImage(file);
      const mainTask = {
        title: generatedTodo.mainTask.title,
        dueDate: Timestamp.fromDate(new Date()),
        completed: false,
        owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
        createdTime: Timestamp.fromDate(new Date()),
        priority: generatedTodo.mainTask.priority,
      };
  
      this.subtasks = generatedTodo.subtasks.map((subtask: Todo) => ({
        todo: {
          ...subtask,
          parentId: '', // Placeholder, will be set upon submission
        },
        editing: false,
      }));
      this.taskForm.patchValue(mainTask);
      this.selectedTaskId = null; // No ID until submission
      this.openEditor();
    } catch (error) {
      console.error('Failed to generate todo', error);
      this.snackBar.open('Failed to generate todo', 'Close', {
        duration: 3000,
      });
    }
  }
  async onFileDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files[0] as File | null;
    const title = this.taskForm.get('title')?.value; // Get the current task title
    await this.generateTaskFromImage(file, title); // Pass the title
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  async uploadFile(file: File | null): Promise<void> {
    if (file && file.type.startsWith('image/')) {
      this.selectedFile = file;

      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      this.uploadSuccess = true;
      this.uploadError = false;
      this.imageName.set(file.name);
      await this.generateTaskFromImage(file);
    } else {
      this.uploadSuccess = false;
      this.uploadError = true;
      this.snackBar.open('Only image files are supported!', 'Close', {
        duration: 3000,
        panelClass: 'error',
      });
    }
  }

  removeImage(): void {
    this.selectedFile = null;
    this.imageName.set('');
    this.fileSize.set(0);
    this.imagePreview.set('');
    this.uploadSuccess = false;
    this.uploadError = false;
    this.uploadProgress.set(0);
  }

  async generateTaskFromImage(
    file: File | null,
    title?: string
  ): Promise<void> {
    try {
      const generatedTodo = await this.todoService.generateTodoFromImage(
        file,
        title
      );
      this.subtasks = this.subtasks.concat(
        generatedTodo.subtasks.map((subtask: Todo) => ({
          todo: {
            ...subtask,
            parentId: this.selectedTaskId!,
            id: this.todoService.createTaskRef().id, // Use Firestore-generated ID
          },
          editing: false,
        }))
      );
    } catch (error) {
      console.error('Failed to generate todo', error);
      this.snackBar.open('Failed to generate todo', 'Close', {
        duration: 3000,
      });
    }
  }

  updateComplete(todo: Todo): void {
    const updated = { ...todo, completed: !todo.completed };
    this.todoService.updateTodoAndSubtasks(
      updated,
      this.subtasks.map((st) => st.todo)
    );
  }

  deleteTask(todo: Todo): void {
    if (todo.id) {
      this.todoService.deleteMainTaskAndSubtasks(todo.id);
    }
  }

  submit(): void {
    if (this.taskForm.invalid) {
      return;
    }
  
    const newTaskRef = this.selectedTaskId
      ? this.todoService.createTaskRef(this.selectedTaskId)
      : this.todoService.createTaskRef(); // Generate Firestore ID only if new
  
    const mainTask: Todo = {
      ...this.taskForm.value,
      id: this.selectedTaskId || newTaskRef.id, // Use generated ID if new
      owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };
  
    // Update the parentId for subtasks with the newly generated main task ID
    const subtaskTodos = this.subtasks.map((subtask) => ({
      ...subtask.todo,
      parentId: this.selectedTaskId || newTaskRef.id,
    }));
  
    if (this.selectedTaskId) {
      this.todoService.updateTodoAndSubtasks(mainTask, subtaskTodos);
      console.log("update", mainTask, subtaskTodos);
    } else {
      this.todoService.addMainTaskWithSubtasks(mainTask, subtaskTodos);
      console.log("new", mainTask, subtaskTodos);
    }
    this.closeEditor();
  }
  

  private resetForm(): void {
    this.selectedTaskId = null;
    this.subtasks = [];
    this.showDescriptionInput = false;
    this.descriptionInput = '';
    this.taskForm.reset({
      title: '',
      dueDate: '',
      priority: 'none',
      completed: false,
    });
  }
  
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      // Format date to mm/dd/yyyy for display
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private parseFirestoreTimestamp(timestamp: any): Date | null {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    return null;
  }
}
