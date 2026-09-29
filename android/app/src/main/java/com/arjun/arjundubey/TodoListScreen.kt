package com.arjun.arjundubey

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.arjun.arjundubey.whiteboard.WhiteboardScreen
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FirebaseFirestore

@Composable
fun TodoListScreen(
    userId: String,
    uiScale: Float,
    onUiScaleChange: (Float) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier
) {
    val db = FirebaseFirestore.getInstance()
    val todosCollection = db.collection("users").document(userId).collection("todos")

    var allNodes by remember { mutableStateOf<List<Todo>>(emptyList()) }
    var newTaskText by remember { mutableStateOf("") }

    var currentFolderId by remember { mutableStateOf("") }
    var isEditMode by remember { mutableStateOf(false) }

    var selectedTodoId by remember { mutableStateOf<String?>(null) }
    var whiteboardTodoId by remember { mutableStateOf<String?>(null) }
    var nodeToRename by remember { mutableStateOf<Todo?>(null) }
    var showSettingsDialog by remember { mutableStateOf(false) }

    var clipboardNode by remember { mutableStateOf<Todo?>(null) }
    var isCutOperation by remember { mutableStateOf(false) }

    DisposableEffect(userId) {
        val listener = todosCollection
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                if (snapshot != null) {
                    allNodes = snapshot.documents.mapNotNull { it.toObject(Todo::class.java) }
                }
            }
        onDispose { listener.remove() }
    }

    val currentFolder = allNodes.find { it.id == currentFolderId }
    val selectedTodo = allNodes.find { it.id == selectedTodoId }
    val whiteboardTodo = allNodes.find { it.id == whiteboardTodoId }

    if (whiteboardTodo != null) {
        WhiteboardScreen(
            todo = whiteboardTodo,
            modifier = modifier,
            onDismiss = { whiteboardTodoId = null },
            onSave = { json ->
                todosCollection.document(whiteboardTodo.id).update("whiteboardJson", json)
            },
            onAutoSave = { json ->
                todosCollection.document(whiteboardTodo.id).update("whiteboardJson", json)
            }
        )
    } else {
        Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                if (currentFolderId.isNotEmpty()) {
                    IconButton(onClick = {
                        val parentId = currentFolder?.parentId ?: ""
                        currentFolderId = parentId
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
                Text(
                    text = currentFolder?.task ?: "My Tasks",
                    style = MaterialTheme.typography.titleLarge
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                if (clipboardNode != null && isEditMode) {
                    val canPaste = isValidPaste(currentFolderId, clipboardNode!!.id, allNodes)
                    TextButton(
                        enabled = canPaste,
                        onClick = {
                            if (isCutOperation) {
                                todosCollection.document(clipboardNode!!.id).update("parentId", currentFolderId)
                                clipboardNode = null
                            } else {
                                performCopy(clipboardNode!!, currentFolderId, todosCollection, allNodes)
                            }
                        }
                    ) {
                        Text("Paste")
                    }
                }

                TextButton(onClick = {
                    isEditMode = !isEditMode
                    if (!isEditMode) {
                        clipboardNode = null
                    }
                }) {
                    Text(if (isEditMode) "Done" else "Edit")
                }

                IconButton(onClick = { showSettingsDialog = true }) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings")
                }

                Button(onClick = onSignOut) { Text("Sign Out") }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (isEditMode) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = newTaskText,
                    onValueChange = { newTaskText = it },
                    modifier = Modifier.weight(1f),
                    label = { Text("New item...") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    enabled = newTaskText.isNotBlank(),
                    onClick = {
                        val docRef = todosCollection.document()
                        val todo = Todo(id = docRef.id, parentId = currentFolderId, type = "TODO", task = newTaskText)
                        docRef.set(todo)
                        newTaskText = ""
                    }
                ) {
                    Text("Task")
                }
                Spacer(modifier = Modifier.width(4.dp))
                Button(
                    enabled = newTaskText.isNotBlank(),
                    onClick = {
                        val docRef = todosCollection.document()
                        val folder = Todo(id = docRef.id, parentId = currentFolderId, type = "FOLDER", task = newTaskText)
                        docRef.set(folder)
                        newTaskText = ""
                    }
                ) {
                    Text("Folder")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        LazyColumn(modifier = Modifier.weight(1f)) {
            val displayNodes = allNodes
                .filter { it.parentId == currentFolderId }
                .sortedByDescending { it.timestamp }

            itemsIndexed(displayNodes, key = { _, node -> node.id }) { index, node ->
                TodoItemRow(
                    todo = node,
                    isEditMode = isEditMode,
                    isCutTarget = isCutOperation && clipboardNode?.id == node.id,
                    canMoveUp = index > 0,
                    canMoveDown = index < displayNodes.size - 1,
                    onMoveUp = {
                        val prevNode = displayNodes[index - 1]
                        val prevTime = prevNode.timestamp
                        val currTime = node.timestamp
                        val (newCurrTime, newPrevTime) = if (prevTime == currTime) {
                            Pair(prevTime + 1, currTime - 1)
                        } else {
                            Pair(prevTime, currTime)
                        }
                        todosCollection.document(node.id).update("timestamp", newCurrTime)
                        todosCollection.document(prevNode.id).update("timestamp", newPrevTime)
                    },
                    onMoveDown = {
                        val nextNode = displayNodes[index + 1]
                        val nextTime = nextNode.timestamp
                        val currTime = node.timestamp
                        val (newCurrTime, newNextTime) = if (currTime == nextTime) {
                            Pair(currTime - 1, nextTime + 1)
                        } else {
                            Pair(nextTime, currTime)
                        }
                        todosCollection.document(node.id).update("timestamp", newCurrTime)
                        todosCollection.document(nextNode.id).update("timestamp", newNextTime)
                    },
                    onToggle = { isChecked ->
                        todosCollection.document(node.id).update("isCompleted", isChecked)
                    },
                    onClickFolder = {
                        currentFolderId = node.id
                    },
                    onClickTodo = {
                        selectedTodoId = node.id
                    },
                    onLongClickTodo = {
                        whiteboardTodoId = node.id
                    },
                    onDelete = {
                        performDelete(node.id, todosCollection, allNodes)
                    },
                    onCut = {
                        clipboardNode = node
                        isCutOperation = true
                    },
                    onCopy = {
                        clipboardNode = node
                        isCutOperation = false
                    },
                    onRename = {
                        nodeToRename = node
                    }
                )
            }
        }
        }
    }

    if (showSettingsDialog) {
        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = { Text("Settings") },
            text = {
                Column {
                    Text("Global UI Scale: ${"%.1f".format(uiScale)}x")
                    Spacer(modifier = Modifier.height(8.dp))
                    Slider(
                        value = uiScale,
                        onValueChange = onUiScaleChange,
                        valueRange = 0.5f..2.0f,
                        steps = 14
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showSettingsDialog = false }) {
                    Text("Close")
                }
            }
        )
    }

    if (selectedTodo != null) {
        StepsDialog(
            todo = selectedTodo,
            isEditMode = isEditMode,
            onDismiss = { selectedTodoId = null },
            onUpdateSteps = { newSteps ->
                todosCollection.document(selectedTodo.id).update("steps", newSteps)
            }
        )
    }

    if (nodeToRename != null) {
        RenameDialog(
            todo = nodeToRename!!,
            onDismiss = { nodeToRename = null },
            onRenameConfirm = { newName ->
                todosCollection.document(nodeToRename!!.id).update("task", newName)
                nodeToRename = null
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TodoItemRow(
    todo: Todo,
    isEditMode: Boolean,
    isCutTarget: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onToggle: (Boolean) -> Unit,
    onClickFolder: () -> Unit,
    onClickTodo: () -> Unit,
    onLongClickTodo: () -> Unit,
    onDelete: () -> Unit,
    onCut: () -> Unit,
    onCopy: () -> Unit,
    onRename: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .alpha(if (isCutTarget) 0.4f else 1f)
            .combinedClickable(
                onClick = {
                    if (todo.type == "FOLDER") onClickFolder() else onClickTodo()
                },
                onLongClick = {
                    if (todo.type == "TODO") onLongClickTodo()
                }
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (todo.type == "TODO") {
                    Checkbox(
                        checked = todo.isCompleted,
                        onCheckedChange = onToggle,
                        enabled = !isEditMode
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                } else {
                    Text("📁", modifier = Modifier.padding(end = 12.dp, start = 8.dp))
                }

                Text(
                    text = todo.task,
                    modifier = Modifier.weight(1f)
                )
            }

            if (isEditMode) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                        Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Move Up")
                    }
                    IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Move Down")
                    }
                    IconButton(onClick = onRename) { Text("✏️") }
                    IconButton(onClick = onCut) { Text("✂️") }
                    IconButton(onClick = onCopy) { Text("📋") }
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun RenameDialog(
    todo: Todo,
    onDismiss: () -> Unit,
    onRenameConfirm: (String) -> Unit
) {
    var renameText by remember { mutableStateOf(todo.task) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (todo.type == "FOLDER") "Rename Folder" else "Rename Task") },
        text = {
            OutlinedTextField(
                value = renameText,
                onValueChange = { renameText = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(
                enabled = renameText.isNotBlank() && renameText != todo.task,
                onClick = { onRenameConfirm(renameText) }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun StepsDialog(
    todo: Todo,
    isEditMode: Boolean,
    onDismiss: () -> Unit,
    onUpdateSteps: (List<String>) -> Unit
) {
    var newStepText by remember { mutableStateOf("") }
    val scrollState = rememberScrollState()

    var editIndex by remember { mutableStateOf<Int?>(null) }
    var editText by remember { mutableStateOf("") }

    var insertIndex by remember { mutableStateOf<Int?>(null) }
    var insertText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(todo.task) },
        text = {
            Column {
                if (todo.steps.isEmpty() && !isEditMode) {
                    Text("No steps added.")
                } else {
                    Column(modifier = Modifier.verticalScroll(scrollState)) {
                        todo.steps.forEachIndexed { index, step ->
                            if (isEditMode && index > 0) {
                                Box(
                                    modifier = Modifier.fillMaxWidth(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    IconButton(
                                        onClick = {
                                            insertIndex = index
                                            insertText = ""
                                        },
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = "Insert Step Here")
                                    }
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Text("• $step", modifier = Modifier.weight(1f))
                                if (isEditMode) {
                                    IconButton(
                                        onClick = {
                                            val updated = todo.steps.toMutableList()
                                            val temp = updated[index]
                                            updated[index] = updated[index - 1]
                                            updated[index - 1] = temp
                                            onUpdateSteps(updated)
                                        },
                                        enabled = index > 0
                                    ) {
                                        Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Move Up")
                                    }

                                    IconButton(
                                        onClick = {
                                            val updated = todo.steps.toMutableList()
                                            val temp = updated[index]
                                            updated[index] = updated[index + 1]
                                            updated[index + 1] = temp
                                            onUpdateSteps(updated)
                                        },
                                        enabled = index < todo.steps.size - 1
                                    ) {
                                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Move Down")
                                    }

                                    IconButton(
                                        onClick = {
                                            editIndex = index
                                            editText = step
                                        }
                                    ) {
                                        Icon(Icons.Default.Edit, contentDescription = "Edit Step")
                                    }

                                    IconButton(onClick = {
                                        val updated = todo.steps.toMutableList().apply { removeAt(index) }
                                        onUpdateSteps(updated)
                                    }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Delete Step")
                                    }
                                }
                            }
                        }
                    }
                }

                if (isEditMode) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = newStepText,
                            onValueChange = { newStepText = it },
                            label = { Text("New step (Bottom)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                if (newStepText.isNotBlank()) {
                                    val updated = todo.steps + newStepText
                                    onUpdateSteps(updated)
                                    newStepText = ""
                                }
                            },
                            enabled = newStepText.isNotBlank()
                        ) {
                            Text("Add")
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )

    if (editIndex != null) {
        AlertDialog(
            onDismissRequest = { editIndex = null },
            title = { Text("Edit Step") },
            text = {
                OutlinedTextField(
                    value = editText,
                    onValueChange = { editText = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(
                    enabled = editText.isNotBlank(),
                    onClick = {
                        val updated = todo.steps.toMutableList()
                        updated[editIndex!!] = editText
                        onUpdateSteps(updated)
                        editIndex = null
                    }
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { editIndex = null }) { Text("Cancel") }
            }
        )
    }

    if (insertIndex != null) {
        AlertDialog(
            onDismissRequest = { insertIndex = null },
            title = { Text("Insert Step") },
            text = {
                OutlinedTextField(
                    value = insertText,
                    onValueChange = { insertText = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(
                    enabled = insertText.isNotBlank(),
                    onClick = {
                        val updated = todo.steps.toMutableList()
                        updated.add(insertIndex!!, insertText)
                        onUpdateSteps(updated)
                        insertIndex = null
                    }
                ) { Text("Insert") }
            },
            dismissButton = {
                TextButton(onClick = { insertIndex = null }) { Text("Cancel") }
            }
        )
    }
}

fun performDelete(nodeId: String, collection: CollectionReference, currentNodesList: List<Todo>) {
    collection.document(nodeId).delete()
    currentNodesList.filter { it.parentId == nodeId }.forEach { child ->
        performDelete(child.id, collection, currentNodesList)
    }
}

fun performCopy(node: Todo, newParentId: String, collection: CollectionReference, currentNodesList: List<Todo>) {
    val newId = collection.document().id
    val newNode = node.copy(id = newId, parentId = newParentId, timestamp = System.currentTimeMillis())
    collection.document(newId).set(newNode)

    if (node.type == "FOLDER") {
        currentNodesList.filter { it.parentId == node.id }.forEach { child ->
            performCopy(child, newId, collection, currentNodesList)
        }
    }
}

fun isValidPaste(targetFolderId: String, clipboardId: String, allNodes: List<Todo>): Boolean {
    if (targetFolderId == clipboardId) return false
    var current = allNodes.find { it.id == targetFolderId }
    while (current != null) {
        if (current.parentId == clipboardId) return false
        current = allNodes.find { it.id == current.parentId }
    }
    return true
}
