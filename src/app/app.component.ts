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
  tasksWithSubtasks: any[] = []; // Main tasks with subtasks
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
      priority: ['none', Validators.required],
      completed: [false],
      flagged: [false],
    });
  }
  addSubtask(): void {
    if (!this.newSubtaskTitle.trim()) return;
  
    const newSubtask: Todo = {
      id: this.todoService.createTaskRef().id,
      title: this.newSubtaskTitle.trim(),
      dueDate: Timestamp.fromDate(new Date()),
      completed: false,
      parentId: this.selectedTaskId || '', // Use parent ID if available, otherwise empty string
      order: this.subtasks.length, // Set the order as the last in the list
      owner: this.todoService.currentUser?.uid || this.todoService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };
  
    if (this.selectedTaskId) {
      // If the main task has been saved (has an ID), save the subtask to Firestore
      this.todoService.addSubtask(newSubtask).then(() => {
        this.subtasks.push({ todo: newSubtask, editing: false });
        this.newSubtaskTitle = ''; // Clear the input box
      }).catch((error) => {
        console.error('Failed to add subtask', error);
        this.snackBar.open('Failed to add subtask', 'Close', {
          duration: 3000,
        });
      });
    } else {
      // If the main task has not been saved, add the subtask to the local array only
      this.subtasks.push({ todo: newSubtask, editing: false });
      this.newSubtaskTitle = ''; // Clear the input box
    }
  }
  

  async generateMoreSubtasksFromImage(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) return;
  
    try {
      // Get the title of the main task
      const mainTaskTitle = this.taskForm.get('title')?.value || '';
  
      // Pass the main task title along with the image file
      const generatedSubtasks = await this.todoService.generateTodoFromImage(file, mainTaskTitle);
  
      generatedSubtasks.subtasks.forEach((subtask: Todo) => {
        const newSubtask: Todo = {
          ...subtask,
          id: this.todoService.createTaskRef().id,
          parentId: this.selectedTaskId || '', // Placeholder until main task is saved
          order: this.subtasks.length, // Add to the end of the current subtasks
        };
  
        if (this.selectedTaskId) {
          // Save to Firestore immediately if the main task has been saved
          this.todoService.addSubtask(newSubtask).then(() => {
            this.subtasks.push({ todo: newSubtask, editing: false });
          }).catch((error) => {
            console.error('Failed to add generated subtask', error);
            this.snackBar.open('Failed to add generated subtask', 'Close', {
              duration: 3000,
            });
          });
        } else {
          // Otherwise, just add to the local array
          this.subtasks.push({ todo: newSubtask, editing: false });
        }
      });
    } catch (error) {
      console.error('Failed to generate subtasks from image', error);
      this.snackBar.open('Failed to generate subtasks', 'Close', {
        duration: 3000,
      });
    }
  }
  

  loadTodos(): void {
    this.todoService.loadTodos().subscribe(
      (todos) => {
        // Create a map to categorize main tasks and subtasks
        const taskMap = new Map<string, TaskWithSubtasks>();

        todos.forEach((todo: Todo) => {
          if (!todo.parentId) {
            // It's a main task
            if (taskMap.has(todo.id)) {
              // If there's already an entry (subtasks added before main task), update the main task
              taskMap.get(todo.id)!.mainTask = todo;
            } else {
              // Otherwise, create a new entry for this main task
              taskMap.set(todo.id, { mainTask: todo, subtasks: [] });
            }
          } else {
            // It's a subtask
            if (taskMap.has(todo.parentId)) {
              // If the main task already exists, add this subtask to it
              taskMap.get(todo.parentId)!.subtasks.push(todo);
            } else {
              // If the main task doesn't exist yet, create a placeholder and add the subtask
              taskMap.set(todo.parentId, {
                mainTask: {} as Todo, // Placeholder for the main task
                subtasks: [todo],
              });
            }
          }
        });

        // Convert the map to an array for easier iteration in the template
        this.todos = Array.from(taskMap.values());
        console.log('Tasks with subtasks: ', this.todos); // Log the categorized tasks
      },
      (error) => {
        console.error('Error loading todos:', error);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
        });
      }
    );
  }

  openEditor(task: Todo | null = null): void {
    this.showEditor = true;
    if (task) {
      this.selectedTaskId = task.id;
  
      // Convert the dueDate Timestamp to a Date object before patching the form
      const dueDate = task.dueDate ? this.parseFirestoreTimestamp(task.dueDate) : null;
      
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

  loadSubtasks(mainTaskId: string): void {
    this.todoService
      .loadSubtasks(mainTaskId)
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
    const subtaskTodos = this.subtasks.map((subtask, index) => ({
      ...subtask.todo,
      parentId: this.selectedTaskId || newTaskRef.id,
      order: index, // Ensure the order is updated based on the current index
    }));
  
    if (this.selectedTaskId) {
      // Update main task and subtasks in Firestore
      this.todoService.updateTodoAndSubtasks(mainTask, subtaskTodos).then(() => {
        console.log("Updated", mainTask, subtaskTodos);
      });
    } else {
      // Add new main task and subtasks to Firestore
      this.todoService.addMainTaskWithSubtasks(mainTask, subtaskTodos).then(() => {
        console.log("New", mainTask, subtaskTodos);
      });
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
