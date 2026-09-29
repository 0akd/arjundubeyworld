package com.arjun.arjundubey

import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class TodoJsonTest {
    @Test
    fun createPayloadIncludesDefaults() {
        val todo = Todo(
            id = "task-1",
            parentId = "",
            type = "TODO",
            task = "Buy milk",
            isCompleted = false,
            timestamp = 1_700_000_000_000,
            steps = emptyList(),
            whiteboardJson = "",
        )

        val json = TodoJson.encodeTodo(todo).let(TodoJson.json::parseToJsonElement).jsonObject

        assertEquals("task-1", json.getValue("id").jsonPrimitive.content)
        assertEquals("", json.getValue("parentId").jsonPrimitive.content)
        assertEquals("TODO", json.getValue("type").jsonPrimitive.content)
        assertEquals("Buy milk", json.getValue("task").jsonPrimitive.content)
        assertFalse(json.getValue("isCompleted").jsonPrimitive.boolean)
        assertEquals(1_700_000_000_000, json.getValue("timestamp").jsonPrimitive.long)
        assertEquals(0, json.getValue("steps").jsonArray.size)
        assertEquals("", json.getValue("whiteboardJson").jsonPrimitive.content)
    }

    @Test
    fun patchOmitsFieldsThatAreNotSet() {
        val json = TodoJson.encodePatch(
            TodoPatch(isCompleted = true, parentId = "")
        ).let(TodoJson.json::parseToJsonElement).jsonObject

        assertEquals(setOf("isCompleted", "parentId"), json.keys)
        assertEquals(true, json.getValue("isCompleted").jsonPrimitive.boolean)
        assertEquals("", json.getValue("parentId").jsonPrimitive.content)
    }
}
