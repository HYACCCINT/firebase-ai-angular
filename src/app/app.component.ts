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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TaskWithSubtasks, Task, TaskService } from './services/task.service';

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
  tasks: any[] = [];
  subtasks: { task: Task; editing: boolean }[] = []; // List of subtasks with editing state
  showDescriptionInput = false;
  descriptionInput = '';
  newSubtaskTitle = '';
  maxFileSizeMB = 20;

  imageName = signal('');
  fileSize = signal(0);
  uploadProgress = signal(0);
  imagePreview = signal('');
  @ViewChild('fileInput') fileInput: ElementRef | undefined;
  selectedFile: File | null = null;
  uploadSuccess: boolean = false;
  uploadError: boolean = false;

  constructor(
    public taskService: TaskService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadTasks();
    this.generateMainTask();
  }

  initForm(): void {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      priority: ['none', Validators.required],
      completed: [false],
      flagged: [false],
    });
  }

  addSubtask(): void {
    if (!this.newSubtaskTitle.trim()) return;

    const newSubtask: Task = {
      id: this.taskService.createTaskRef().id,
      title: this.newSubtaskTitle.trim(),
      completed: false,
      parentId: this.selectedTaskId || '',
      order: this.subtasks.length,
      owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };

    this.subtasks.push({ task: newSubtask, editing: false });
    this.newSubtaskTitle = '';
  }

  async generateSubtasksFromImage(event: any): Promise<void> {
    const file = event.target.files[0] as File | null;
    if (!file) {
      this.snackBar.open('File not found', 'Close', {
        duration: 3000,
      });
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024); // Convert bytes to MB
    if (fileSizeMB > this.maxFileSizeMB) {
      this.snackBar.open(
        'File size exceeds 20MB limit. Please select a smaller file.',
        'Close',
        {
          duration: 3000,
        }
      );
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
      const maintaskTitle = this.taskForm.get('title')?.value || '';
      const owner =
        this.taskService.currentUser?.uid || this.taskService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());

      const generatedSubtasks = await this.taskService.generateTaskFromImage(
        file,
        maintaskTitle
      );

      generatedSubtasks?.subtasks?.forEach((subtask: Task) => {
        const newSubtask: Task = {
          ...subtask,
          id: this.taskService.createTaskRef().id,
          parentId: this.selectedTaskId || '',
          order: this.subtasks.length,
          owner: owner,
          createdTime: currentTime,
          completed: false,
        };

        this.subtasks.push({ task: newSubtask, editing: false });
      });
    } catch (error) {
      console.error('Failed to generate subtasks from image', error);
      this.snackBar.open('Failed to generate subtasks', 'Close', {
        duration: 3000,
      });
    }
  }

  deleteSubtask(subtask: { task: Task; editing: boolean }): void {
    this.subtasks = this.subtasks.filter(
      (st) => st.task.id !== subtask.task.id
    );
  }

  loadTasks(): void {
    this.taskService.tasks$.subscribe({
      next: (tasks: any) => {
        const taskMap = new Map<string, TaskWithSubtasks>();
        tasks.forEach((task: Task) => {
          if (!task.parentId) {
            // It's a main task
            if (taskMap.has(task.id)) {
              taskMap.get(task.id)!.maintask = task;
            } else {
              taskMap.set(task.id, { maintask: task, subtasks: [] });
            }
          } else {
            // It's a subtask
            if (taskMap.has(task.parentId)) {
              taskMap.get(task.parentId)!.subtasks.push(task);
            } else {
              taskMap.set(task.parentId, {
                maintask: {} as Task,
                subtasks: [task],
              });
            }
          }
        });

        this.tasks = Array.from(taskMap.values());
      },
      error: (error: any) => {
        console.error('Error loading tasks:', error);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  openEditor(task: Task | null = null): void {
    this.showEditor = true;
    if (task) {
      this.selectedTaskId = task.id;
      this.taskForm.patchValue({
        ...task,
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
    this.taskService
      .loadSubtasks(maintaskId)
      .then((subtasksObservable: any) => {
        subtasksObservable.subscribe({
          next: (subtasks: any) => {
            this.subtasks = subtasks.map((task: any) => ({
              task,
              editing: false,
            }));
          },
          error: (error: any) => {
            console.error('Error loading subtasks:', error);
            this.snackBar.open('Error loading subtasks', 'Close', {
              duration: 3000,
            });
          },
        });
      })
      .catch((error: any) => {
        console.error('Error resolving subtasks observable:', error);
        this.snackBar.open('Error resolving subtasks observable', 'Close', {
          duration: 3000,
        });
      });
  }

  moveSubtaskUp(subtask: { task: Task; editing: boolean }): void {
    const index = this.subtasks.findIndex(
      (st) => st.task.id === subtask.task.id
    );
    if (index > 0) {
      [this.subtasks[index], this.subtasks[index - 1]] = [
        this.subtasks[index - 1],
        this.subtasks[index],
      ];
      this.updateSubtaskOrder();
    }
  }

  moveSubtaskDown(subtask: { task: Task; editing: boolean }): void {
    const index = this.subtasks.findIndex(
      (st) => st.task.id === subtask.task.id
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
      subtask.task.order = index;
    });
  }

  generateTaskFromDescription(): void {
    this.taskService
      .generateTaskFromDescription(this.descriptionInput)
      .then((generatedTask: any) => {
        this.subtasks = this.subtasks.concat(
          generatedTask.subtasks.map((task: any) => ({ task, editing: false }))
        );
      });
  }

  generateMainTask(): void {
    this.taskService
      .generateMainTask()
      .then((generatedTask: any) => {
        const newTaskRef = this.taskService.createTaskRef();
        const newTask: Task = {
          id: newTaskRef.id,
          title: generatedTask.title,
          completed: false,
          owner:
            this.taskService.currentUser?.uid || this.taskService.localUid!,
          createdTime: Timestamp.fromDate(new Date()),
          priority: generatedTask.priority ? generatedTask.priority.toLowerCase() : 'none',
        };
        this.loadTasks();
        this.openEditor(newTask);
      })
      .catch((error: any) => {
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
      const generatedTask = await this.taskService.generateTaskFromImage(file);
      const maintask = {
        title: generatedTask.maintask.title,
        completed: false,
        owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
        createdTime: Timestamp.fromDate(new Date()),
        priority: generatedTask.maintask.priority,
      } as Task;

      this.subtasks = generatedTask.subtasks.map((subtask: Task) => ({
        task: {
          ...subtask,
          parentId: '', // Placeholder
        },
        editing: false,
      }));
      this.selectedTaskId = null;
      this.openEditor(maintask);
    } catch (error) {
      console.error('Failed to generate task', error);
      this.snackBar.open('Failed to generate task', 'Close', {
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
      const generatedTask = await this.taskService.generateTaskFromImage(
        file,
        title
      );

      const owner =
        this.taskService.currentUser?.uid || this.taskService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());

      // Create an array to store the new subtasks
      const newSubtasks = [];

      for (let subtask of generatedTask.subtasks) {
        const newSubtask = {
          task: {
            ...subtask,
            parentId: this.selectedTaskId || '', // Placeholder, to be set on save
            id: this.taskService.createTaskRef().id,
            order: this.subtasks.length + newSubtasks.length, // Add to the end of the current subtasks
            createdTime: currentTime,
            owner: owner,
            completed: false,
          },
          editing: false,
        } as any;
        newSubtasks.push(newSubtask);
      }

      this.subtasks = this.subtasks.concat(newSubtasks);
    } catch (error) {
      console.error('Failed to generate task', error);
      this.snackBar.open('Failed to generate task', 'Close', {
        duration: 3000,
      });
    }
  }

  updateComplete(task: Task): void {
    // Toggle the completed status
    const updated = { ...task, completed: !task.completed };

    if (!task.parentId) {
      const maintaskIndex = this.tasks.findIndex(
        (t) => t.maintask.id === task.id
      );
      if (maintaskIndex !== -1) {
        this.tasks[maintaskIndex].maintask = updated;
      }
    } else {
      const subtaskIndex = this.subtasks.findIndex(
        (st) => st.task.id === task.id
      );
      if (subtaskIndex !== -1) {
        this.subtasks[subtaskIndex].task = updated;
      }
    }

    this.taskService
      .updateTask(updated, updated.id)
      .then(() => {
        console.log('Task completion status updated in Firestore');
      })
      .catch((error: any) => {
        console.error(
          'Error updating task completion status in Firestore',
          error
        );
        this.snackBar.open('Error updating task', 'Close', {
          duration: 3000,
        });
      });
  }

  deleteTask(task: Task): void {
    if (task.id) {
      this.taskService.deleteMainTaskAndSubtasks(task.id);
    }
  }

  async generateSubtasksFromTitle(): Promise<void> {
    const maintaskTitle = this.taskForm.get('title')?.value;

    if (!maintaskTitle) {
      this.snackBar.open(
        'Please enter a title for the main task first.',
        'Close',
        {
          duration: 3000,
        }
      );
      return;
    }

    try {
      // Call the service to generate subtasks based on the title
      const generatedSubtasks =
        await this.taskService.generateSubtasksFromTitle(maintaskTitle);

      const owner =
        this.taskService.currentUser?.uid || this.taskService.localUid!;
      const currentTime = Timestamp.fromDate(new Date());

      const newSubtasks = [];

      for (let [index, subtask] of generatedSubtasks.subtasks.entries()) {
        const newSubtask = {
          task: {
            id: this.taskService.createTaskRef().id,
            title: subtask.title,
            completed: false,
            parentId: '',
            order: this.subtasks.length + newSubtasks.length,
            owner: owner,
            createdTime: currentTime,
          },
          editing: false,
        } as any;
        newSubtasks.push(newSubtask);
      }
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
      ? this.taskService.createTaskRef(this.selectedTaskId)
      : this.taskService.createTaskRef(); // Generate Firestore ID only if new
  
    const maintaskInput: Task = {
      ...this.taskForm.value,
      id: this.selectedTaskId || newTaskRef.id,
      owner: this.taskService.currentUser?.uid || this.taskService.localUid!,
      createdTime: Timestamp.fromDate(new Date()),
    };
  
    const subtaskInput = this.subtasks.map((subtask, index) => ({
      ...subtask.task,
      parentId: this.selectedTaskId || newTaskRef.id,
      order: index,
    }));
  
    const existingTaskIndex = this.tasks.findIndex(
      (t) => t.maintask.id === maintaskInput.id
    );
  
    if (existingTaskIndex !== -1) {
      this.tasks[existingTaskIndex] = {
        maintask: maintaskInput,
        subtasks: subtaskInput,
      };
    } else {
      this.tasks.push({ maintask: maintaskInput, subtasks: subtaskInput });
    }
  
    this.taskService.tasksSubject.next([...this.tasks]);
  
    if (this.selectedTaskId) {
      this.taskService.updateTaskAndSubtasks(maintaskInput, subtaskInput);
    } else {
      this.taskService.addMainTaskWithSubtasks(maintaskInput, subtaskInput);
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
      priority: 'none',
      completed: false,
    });
    this.removeImage()
  }
}
