const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

const app = createApp({
  setup() {
    const isAuthenticated = ref(false);
    const loginPassword = ref('');
    const loginError = ref('');
    const tasks = ref([]);
    const showCreateModal = ref(false);
    const selectedTask = ref(null);
    const taskComments = ref([]);
    const newComment = ref('');
    const notifications = ref([]);
    const socket = ref(null);

    const columns = [
      { title: '📋 待指派', status: 'todo' },
      { title: '🔄 进行中', status: 'doing' },
      { title: '👀 待确认', status: 'review' },
      { title: '✅ 已完成', status: 'done' }
    ];

    const newTask = ref({
      title: '',
      description: '',
      priority: 1,
      deadline: '',
      assignee: ''
    });

    const API_BASE = '/api';

    // 检查认证状态
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/check-auth`, { credentials: 'include' });
        const data = await res.json();
        isAuthenticated.value = data.authenticated;
        if (data.authenticated) {
          connectSocket();
          loadTasks();
        }
      } catch (e) {
        console.error('Auth check failed:', e);
      }
    };

    // 登录
    const login = async () => {
      try {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: loginPassword.value }),
          credentials: 'include'  // 关键：带上 cookie
        });
        const data = await res.json();
        if (data.success) {
          isAuthenticated.value = true;
          loginError.value = '';
          localStorage.setItem('amy_auth', 'true');  // 存储认证状态
          connectSocket();
          loadTasks();
        } else {
          loginError.value = data.message;
        }
      } catch (e) {
        loginError.value = '登录失败，请重试';
      }
    };

    // 退出
    const logout = () => {
      document.cookie = 'auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      isAuthenticated.value = false;
      if (socket.value) {
        socket.value.disconnect();
      }
    };

    // 连接 WebSocket
    const connectSocket = () => {
      socket.value = io();

      socket.value.on('task:created', (task) => {
        tasks.value.unshift(task);
        showNotification('新任务已创建');
      });

      socket.value.on('task:updated', (task) => {
        const idx = tasks.value.findIndex(t => t.id === task.id);
        if (idx !== -1) tasks.value[idx] = task;
      });

      socket.value.on('task:status_changed', ({ task, oldStatus, newStatus }) => {
        const idx = tasks.value.findIndex(t => t.id === task.id);
        if (idx !== -1) tasks.value[idx] = task;
        if (selectedTask.value?.id === task.id) {
          selectedTask.value = task;
        }
      });

      socket.value.on('task:deleted', ({ taskId }) => {
        tasks.value = tasks.value.filter(t => t.id !== taskId);
        if (selectedTask.value?.id === taskId) {
          selectedTask.value = null;
        }
      });

      socket.value.on('comment:added', ({ taskId, comment }) => {
        if (selectedTask.value?.id === taskId) {
          taskComments.value.push(comment);
        }
      });
    };

    // 加载任务
    const loadTasks = async () => {
      try {
        const res = await fetch(`${API_BASE}/tasks`, { credentials: 'include' });
        tasks.value = await res.json();
      } catch (e) {
        console.error('Failed to load tasks:', e);
      }
    };

    // 获取任务
    const getTasksByStatus = (status) => {
      return tasks.value.filter(t => t.status === status);
    };

    // 创建任务
    const createTask = async () => {
      if (!newTask.value.title.trim()) return;

      try {
        const res = await fetch(`${API_BASE}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newTask.value,
            created_by: '左右'
          }),
          credentials: 'include'
        });

        if (res.ok) {
          showCreateModal.value = false;
          newTask.value = { title: '', description: '', priority: 1, deadline: '', assignee: '' };
          // 任务会通过 WebSocket 自动更新
        }
      } catch (e) {
        console.error('Failed to create task:', e);
      }
    };

    // 更新状态
    const updateStatus = async (taskId, status) => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, actor: '左右' }),
          credentials: 'include'
        });

        if (res.ok) {
          // 任务会通过 WebSocket 自动更新
        }
      } catch (e) {
        console.error('Failed to update status:', e);
      }
    };

    // 删除任务
    const deleteTask = async (taskId) => {
      if (!confirm('确定要删除这个任务吗？')) return;

      try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}?actor=左右`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (res.ok) {
          // 任务会通过 WebSocket 自动更新
        }
      } catch (e) {
        console.error('Failed to delete task:', e);
      }
    };

    // 启动任务（待指派 → 进行中）
    const startTask = async (taskId) => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: '左右' }),
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.success) {
          console.log('任务已启动，Amy 已收到通知');
          alert('🚀 任务已启动！Amy 正在处理...');
        } else {
          alert(data.message || '❌ 启动失败，请重试');
        }
      } catch (e) {
        console.error('Failed to start task:', e);
        alert('❌ 启动失败，请重试');
      }
    };

    // 查看进展（进行中任务）
    const viewProgress = async (taskId) => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/progress`, {
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
          selectedTask.value = data.task;
          taskComments.value = data.comments || [];
          alert(`📊 任务进展:\n\n${data.progress || '暂无进展记录'}`);
        } else {
          alert('❌ 获取进展失败');
        }
      } catch (e) {
        console.error('Failed to get progress:', e);
        alert('❌ 获取进展失败');
      }
    };

    // 完成/未完成任务（待确认 → 完成/进行中）
    const completeTask = async (taskId, isComplete) => {
      try {
        const res = await fetch(`${API_BASE}/tasks/${taskId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            completed: isComplete,
            actor: '左右'
          }),
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (isComplete) {
            alert('✅ 任务已完成！');
          } else {
            alert('❌ 任务标记为未完成，请输入反馈');
            // 可以弹出反馈输入框
          }
        } else {
          alert(data.message || '操作失败，请重试');
        }
      } catch (e) {
        console.error('Failed to complete task:', e);
        alert('❌ 操作失败，请重试');
      }
    };

    // 打开任务详情
    const openTaskDetail = async (task) => {
      selectedTask.value = task;
      loadComments(task.id);
    };

    // 加载评论
    const loadComments = async (taskId) => {
      try {
        const res = await fetch(`${API_BASE}/comments/${taskId}/comments`, {
          credentials: 'include'
        });
        taskComments.value = await res.json();
      } catch (e) {
        console.error('Failed to load comments:', e);
      }
    };

    // 添加评论
    const addComment = async () => {
      if (!newComment.value.trim() || !selectedTask.value) return;

      try {
        const res = await fetch(`${API_BASE}/comments/${selectedTask.value.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newComment.value, author: '左右' }),
          credentials: 'include'
        });

        if (res.ok) {
          newComment.value = '';
          // 评论会通过 WebSocket 自动更新
        }
      } catch (e) {
        console.error('Failed to add comment:', e);
      }
    };

    // 通知相关
    let notificationId = 0;
    const showNotification = (message, type = 'success') => {
      const id = ++notificationId;
      notifications.value.push({ id, message, type });
      setTimeout(() => {
        notifications.value = notifications.value.filter(n => n.id !== id);
      }, 3000);
    };

    // 工具函数
    const getPriorityClass = (priority) => {
      const classes = {
        0: 'bg-red-500/20 text-red-300',
        1: 'bg-yellow-500/20 text-yellow-300',
        2: 'bg-green-500/20 text-green-300'
      };
      return classes[priority] || classes[2];
    };

    const getPriorityText = (priority) => {
      const texts = { 0: '🔴 P0 紧急', 1: '🟡 P1 高', 2: '🟢 P2 普通' };
      return texts[priority] || '🟢 P2';
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '未设置';
      const date = new Date(dateStr);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    const formatDateTime = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    onMounted(() => {
      checkAuth();
    });

    onUnmounted(() => {
      if (socket.value) {
        socket.value.disconnect();
      }
    });

    return {
      isAuthenticated,
      loginPassword,
      loginError,
      tasks,
      showCreateModal,
      selectedTask,
      taskComments,
      newComment,
      notifications,
      columns,
      newTask,
      columns,
      login,
      logout,
      getTasksByStatus,
      createTask,
      updateStatus,
      deleteTask,
      startTask,
      viewProgress,
      completeTask,
      openTaskDetail,
      addComment,
      getPriorityClass,
      getPriorityText,
      formatDate,
      formatDateTime
    };
  }
});

app.mount('#app');
