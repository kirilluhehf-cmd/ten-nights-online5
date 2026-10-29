(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const modal = $('online-modal');
  if (!modal || typeof io !== 'function') return;
  let socket = null;
  let roomCode = '';
  let role = '';
  let connected = false;

  function status(message, good) {
    const el = $('online-status');
    if (el) {
      el.textContent = message;
      el.style.color = good ? '#8edb9b' : '#e3c36a';
    }
  }
  function showModal() {
    modal.style.display = 'flex';
    if (!socket) {
      status('Подключение к серверу…');
      socket = io({ transports: ['websocket', 'polling'] });
      socket.on('connect', () => {
        connected = true;
        status('Сервер подключён. Создай комнату или введи код друга.', true);
      });
      socket.on('disconnect', () => {
        connected = false;
        status('Связь потеряна. Проверь интернет и обнови страницу.');
      });
      socket.on('connect_error', () => status('Не удалось подключиться к серверу. Попробуй обновить страницу.'));
      socket.on('room:created', data => {
        roomCode = data.code;
        role = data.role || 'host';
        displayRoom('Комната создана! Отправь этот код другу. Ждём второго игрока.');
      });
      socket.on('room:joined', data => {
        roomCode = data.code;
        role = data.role || 'guest';
        displayRoom('Ты вошёл в комнату ' + roomCode + '. Ожидай подключения второго игрока.', true);
      });
      socket.on('room:peer', data => {
        if (!data) return;
        if (data.count >= 2) status('Оба игрока подключены! Комната ' + data.code + '. Теперь запускайте игру.', true);
        else if (roomCode) status('Комната ' + roomCode + ' создана. Ожидаем друга…', true);
      });
      socket.on('room:error', data => status((data && data.message) || 'Ошибка комнаты.'));
    }
  }
  function displayRoom(message, joined) {
    $('online-room-code').style.display = 'block';
    $('online-room-code').textContent = roomCode;
    $('online-code-input').value = roomCode;
    $('online-copy-btn').style.display = role === 'host' ? 'block' : 'none';
    status(message, true);
  }
  $('online-open-btn')?.addEventListener('click', showModal);
  $('online-close')?.addEventListener('click', () => { modal.style.display = 'none'; });
  $('online-create-btn')?.addEventListener('click', () => {
    if (!socket || !connected) return status('Сначала дождись подключения к серверу.');
    socket.emit('room:create');
    status('Создаём комнату…');
  });
  $('online-join-btn')?.addEventListener('click', () => {
    if (!socket || !connected) return status('Сначала дождись подключения к серверу.');
    const code = String($('online-code-input').value || '').trim().toUpperCase();
    if (!code) return status('Введи код комнаты, который прислал друг.');
    socket.emit('room:join', { code });
    status('Подключаемся к комнате ' + code + '…');
  });
  $('online-copy-btn')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(roomCode);
      else { $('online-code-input').focus(); $('online-code-input').select(); document.execCommand('copy'); }
      status('Код ' + roomCode + ' скопирован. Отправь его другу.', true);
    } catch (_) {
      status('Код комнаты: ' + roomCode + ' — выдели его и скопируй вручную.', true);
    }
  });
  $('online-code-input')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  // Keep the room code available for the game's existing client-side logic.
  window.hotelOnline = {
    get roomCode() { return roomCode; },
    get role() { return role; },
    get socket() { return socket; },
    get connected() { return connected; }
  };
})();
