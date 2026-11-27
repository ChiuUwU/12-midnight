const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoomService } = require('../server');

test('Node room services have independent state and do not listen on import', () => {
  const first = createRoomService();
  const second = createRoomService();
  first.rooms.set('123456', { id: '123456' });
  assert.equal(second.rooms.has('123456'), false);
  assert.notEqual(first.handleApi, second.handleApi);
  assert.equal(typeof first.handleRequest, 'function');
  assert.equal(typeof first.createNightSteps, 'function');
});
