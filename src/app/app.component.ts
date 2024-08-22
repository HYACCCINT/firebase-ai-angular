import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
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
import { TaskWithSubtasks, Todo, TodoService } from './services/todo.service';

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
  todos: any[] = [];
  subtasks: { todo: Todo; editing: boolean }[] = []; // List of subtasks with editing state
  showDescriptionInput = false;
  descriptionInput = '';
  newSubtaskTitle = '';

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
      priority: ['None', Validators.required],
      completed: [false],
      flagged: [false],
    });
  }
  addSubtask(): void {
    if (!this.newSubtaskTitle.trim()) return;
  
    const newSubtask: Todo = {
      id: this.todoService.createTaskRef().id, // Generate a temporary ID for the subtask
      title: this.newSubtaskTitle.trim(),
      dueDate: Timestamp.fromDate(new Date()),
      completed: false,
      parentId: this.selectedTaskId || '', // Use parent ID if available, otherwise empty string
      order: this.subtasks.length, // Set the order as the last in the list
      owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };
  
    // Add the subtask to the local array only, without saving to Firestore
    this.subtasks.push({ todo: newSubtask, editing: false });
    this.newSubtaskTitle = ''; // Clear the input box
  }
  

  async generateSubtasksFromImage(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) return;
  
    try {
      // Get the title of the main task
      const maintaskTitle = this.taskForm.get('title')?.value || '';
      const owner = this.todoService.currentUser?.uid || this.todoService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());
  
      // Pass the main task title along with the image file
      const generatedSubtasks = await this.todoService.generateTodoFromImage(file, maintaskTitle);
  
      generatedSubtasks.subtasks.forEach((subtask: Todo) => {
        const newSubtask: Todo = {
          ...subtask,
          id: this.todoService.createTaskRef().id,
          parentId: this.selectedTaskId || '', // Placeholder until main task is saved
          order: this.subtasks.length, // Add to the end of the current subtasks
          owner: owner, // Assign the owner
          createdTime: currentTime, // Assign the created time
          dueDate: subtask.dueDate || currentTime, // Ensure dueDate is set
          completed: false,
        };
  
        // Just add the subtask to the local array, without saving to Firestore
        this.subtasks.push({ todo: newSubtask, editing: false });
      });
    } catch (error) {
      console.error('Failed to generate subtasks from image', error);
      this.snackBar.open('Failed to generate subtasks', 'Close', {
        duration: 3000,
      });
    }
  }
  
  

  deleteSubtask(subtask: { todo: Todo; editing: boolean }): void {
    this.subtasks = this.subtasks.filter(st => st.todo.id !== subtask.todo.id);
  }
  

  loadTodos(): void {
    this.todoService.todos$.subscribe({
      next: (todos) => {
        const taskMap = new Map<string, TaskWithSubtasks>();
        todos.forEach((todo: Todo) => {
          if (!todo.parentId) {
            // It's a main task
            if (taskMap.has(todo.id)) {
              taskMap.get(todo.id)!.maintask = todo;
            } else {
              taskMap.set(todo.id, { maintask: todo, subtasks: [] });
            }
          } else {
            // It's a subtask
            if (taskMap.has(todo.parentId)) {
              taskMap.get(todo.parentId)!.subtasks.push(todo);
            } else {
              taskMap.set(todo.parentId, {
                maintask: {} as Todo,
                subtasks: [todo],
              });
            }
          }
        });
  
        this.todos = Array.from(taskMap.values());
      },
      error: (error) => {
        console.error('Error loading todos:', error);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
        });
      }
    });
  }
  

  openEditor(task: Todo | null = null): void {
    this.showEditor = true;
    if (task) {
      this.selectedTaskId = task.id;

      // Convert the dueDate Timestamp to a Date object before patching the form
      const dueDate = task.dueDate
        ? this.parseFirestoreTimestamp(task.dueDate)
        : null;

      this.taskForm.patchValue({
        ...task,
        dueDate: dueDate, // Assign the converted Date object
      });

      this.loadSubtasks(task.id);
    } else {
      this.selectedTaskId = null;
    }
  }

  closeEditor(): void {
    this.showEditor = false;
    this.resetForm();
  }

  loadSubtasks(maintaskId: string): void {
    this.todoService
        .loadSubtasks(maintaskId)
        .then((subtasksObservable) => {
            subtasksObservable.subscribe({
                next: (subtasks) => {
                    this.subtasks = subtasks.map((todo) => ({ todo, editing: false }));
                },
                error: (error) => {
                    console.error('Error loading subtasks:', error);
                    this.snackBar.open('Error loading subtasks', 'Close', {
                        duration: 3000,
                    });
                },
            });
        })
        .catch((error) => {
            console.error('Error resolving subtasks observable:', error);
            this.snackBar.open('Error resolving subtasks observable', 'Close', {
                duration: 3000,
            });
        });
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
    const title = this.taskForm.get('title')?.value;
    await this.generateTaskFromImage(file, title);
  }

  async generateMainWithSubTaskFromImage(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) {
      return;
    }

    try {
      const generatedTodo = await this.todoService.generateTodoFromImage(file);
      const maintask = {
        title: generatedTodo.maintask.title,
        dueDate: Timestamp.fromDate(new Date()),
        completed: false,
        owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
        createdTime: Timestamp.fromDate(new Date()),
        priority: generatedTodo.maintask.priority,
      };

      this.subtasks = generatedTodo.subtasks.map((subtask: Todo) => ({
        todo: {
          ...subtask,
          parentId: '', // Placeholder
        },
        editing: false,
      }));
      this.taskForm.patchValue(maintask);
      this.selectedTaskId = null;
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
    const title = this.taskForm.get('title')?.value;
    await this.generateTaskFromImage(file, title);
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
      const generatedTask = await this.todoService.generateTodoFromImage(file, title);
  
      const owner = this.todoService.currentUser?.uid || this.todoService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());
  
      // Create an array to store the new subtasks
      const newSubtasks = [];
  
      for (let subtask of generatedTask.subtasks) {
        const newSubtask = {
          todo: {
            ...subtask,
            parentId: this.selectedTaskId || '', // Placeholder, to be set on save
            id: this.todoService.createTaskRef().id,
            order: this.subtasks.length + newSubtasks.length, // Add to the end of the current subtasks
            createdTime: currentTime,
            owner: owner,
            dueDate: subtask.dueDate ? subtask.dueDate : currentTime,
            completed: false,
          },
          editing: false,
        } as any;
        newSubtasks.push(newSubtask);
      }
  
      // Concatenate the new subtasks with the existing ones
      this.subtasks = this.subtasks.concat(newSubtasks);
    } catch (error) {
      console.error('Failed to generate task', error);
      this.snackBar.open('Failed to generate task', 'Close', {
        duration: 3000,
      });
    }
  }
  

  updateComplete(todo: Todo): void {
    // Toggle the completed status
    const updated = { ...todo, completed: !todo.completed };
  
    // Update the local state immediately
    if (!todo.parentId) {
      // If it's a main task, update it in the local todos array
      const maintaskIndex = this.todos.findIndex(t => t.maintask.id === todo.id);
      if (maintaskIndex !== -1) {
        this.todos[maintaskIndex].maintask = updated;
      }
    } else {
      // If it's a subtask, update it in the local subtasks array
      const subtaskIndex = this.subtasks.findIndex(st => st.todo.id === todo.id);
      if (subtaskIndex !== -1) {
        this.subtasks[subtaskIndex].todo = updated;
      }
    }
  
    // Update the task in Firestore
    this.todoService.updateTodo(updated, updated.id)
      .then(() => {
        console.log('Task completion status updated in Firestore');
      })
      .catch(error => {
        console.error('Error updating task completion status in Firestore', error);
        this.snackBar.open('Error updating task', 'Close', {
          duration: 3000,
        });
      });
  }
  
  

  deleteTask(todo: Todo): void {
    if (todo.id) {
      this.todoService.deleteMainTaskAndSubtasks(todo.id);
    }
  }

  async generateSubtasksFromTitle(): Promise<void> {
    const maintaskTitle = this.taskForm.get('title')?.value;
  
    if (!maintaskTitle) {
      this.snackBar.open('Please enter a title for the main task first.', 'Close', {
        duration: 3000,
      });
      return;
    }
  
    try {
      // Call the service to generate subtasks based on the title
      const generatedSubtasks = await this.todoService.generateSubtasksFromTitle(maintaskTitle);
  
      const owner = this.todoService.currentUser?.uid || this.todoService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());
  
      // Create an array to store the new subtasks
      const newSubtasks = [];
  
      for (let [index, subtask] of generatedSubtasks.subtasks.entries()) {
        const newSubtask = {
          todo: {
            id: this.todoService.createTaskRef().id,
            title: subtask.title,
            dueDate: subtask.dueDate ? subtask.dueDate : currentTime,
            completed: false,
            parentId: '', // Placeholder, will be set upon submission
            order: this.subtasks.length + newSubtasks.length, // Set the order as the next in the list
            owner: owner,
            createdTime: currentTime,
          },
          editing: false,
        } as any;
        newSubtasks.push(newSubtask);
      }
  
      // Concatenate the new subtasks with the existing ones
      this.subtasks = this.subtasks.concat(newSubtasks);
    } catch (error) {
      console.error('Failed to generate subtasks from title', error);
      this.snackBar.open('Failed to generate subtasks', 'Close', {
        duration: 3000,
      });
    }
  }
  
  
  
  submit(): void {
    if (this.taskForm.invalid) {
      return;
    }

    const newTaskRef = this.selectedTaskId
      ? this.todoService.createTaskRef(this.selectedTaskId)
      : this.todoService.createTaskRef(); // Generate Firestore ID only if new

    const maintask: Todo = {
      ...this.taskForm.value,
      id: this.selectedTaskId || newTaskRef.id,
      owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };
    const subtaskTodos = this.subtasks.map((subtask, index) => ({
      ...subtask.todo,
      parentId: this.selectedTaskId || newTaskRef.id,
      order: index, // Ensure the order is updated based on the current index
    }));
    if (this.selectedTaskId) {
      // Update main task and subtasks in Firestore
      this.todoService.updateTodoAndSubtasks(maintask, subtaskTodos);
    } else {
      // Add new main task and subtasks to Firestore
      this.todoService.addMainTaskWithSubtasks(maintask, subtaskTodos);
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

  private formatDate(date: Date | null): string {
    if (!date) return 'invalid';
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
