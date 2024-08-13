import { Component, inject } from '@angular/core';
import { Todo, TodoService } from '../../services/todo.service';
import { Observable } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { DocumentData } from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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

@Component({
  selector: 'app-todo-page',
  standalone: true,
  imports: [
    AsyncPipe,
    CommonModule,
    FormsModule,
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
    ReactiveFormsModule,
  ],
  templateUrl: './todo-page.component.html',
  styleUrl: './todo-page.component.scss',
})
export class TodoPageComponent {
  todoService = inject(TodoService);

  showEditor = false;
  selectedTaskId: string | null = null;
  taskForm!: FormGroup;
  editData = {
    title: '',
    date: '',
    time: '',
    description: '',
    flagged: false,
    priority: 'low',
    completed: false
  };

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.taskForm = this.fb.group({
      title: [this.editData.title, Validators.required],
      date: [this.editData.date, Validators.required],
      time: [this.editData.time, Validators.required],
      description: [this.editData.description],
      flagged: [this.editData.flagged],
      priority: [this.editData.priority, Validators.required],
      completed: [this.editData.completed, Validators.required],
    });
    console.log(this.todoService.loadTodos().subscribe((res:any) => {console.log(res);}));
  }

  async generateTask() {
    try {
      const generatedDataString = await this.todoService.generateTodo(this.todoService.todos); // Use await to wait for the Promise
      const generatedTodo = JSON.parse(generatedDataString);
      this.taskForm.reset({
        title: generatedTodo.title,
        date: Date.parse(generatedTodo.date),
        time: generatedTodo.time,
        description: generatedTodo.description,
        flagged: generatedTodo.flagged,
        priority: generatedTodo.priority,
        completed: false
      });
      this.openEditor(generatedTodo);
    } catch (error) {
      console.error("Failed to generate todo", error);
    }
  }

  submit() {
    if (this.selectedTaskId) {
      this.updateTask();
    } else {
      this.createTask();
    }
  }

  updateTask() {
    if (!this.taskForm.valid || !this.selectedTaskId) {
      return;
    }
    this.todoService.updateTodo(this.taskForm.value, this.selectedTaskId);
    this.taskForm.reset(this.editData);
    this.closeEditor();
  }

  updateComplete(todo: any) {
    if (!todo) {
      return;
    }
    const updated = {...todo, completed: !todo.completed};
    this.todoService.updateTodo(updated, todo.id);
  }

  createTask() {
    if (!this.taskForm.valid) {
      return;
    }
    this.todoService.addTodo(this.taskForm.value);
    this.taskForm.reset(this.editData);
    this.closeEditor();
  }

  openEditor(task: any | null = null) {
    if (task) {
      this.selectedTaskId = task.id;
      this.taskForm.reset({
        title: task.title,
        date: task.date,
        time: task.time,
        description: task.description,
        flagged: task.flagged,
        priority: task.priority,
        completed: task.completed ? task.completed : false,
      });
    }

    this.showEditor = true;
  }

  closeEditor() {
    this.selectedTaskId = null;
    this.showEditor = false;
  }

  deleteTask(task: any) {
    if(task && task.id) {
      this.todoService.deleteTodo(task.id);
    }
    
  }
}
