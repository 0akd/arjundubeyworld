package com.arjun.arjundubey

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.arjun.arjundubey.ui.theme.ArjundubeyTheme
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            var globalUiScale by remember { mutableFloatStateOf(1f) }

            ArjundubeyTheme {
                val currentDensity = LocalDensity.current
                val customDensity = Density(
                    density = currentDensity.density * globalUiScale,
                    fontScale = currentDensity.fontScale * globalUiScale
                )

                CompositionLocalProvider(LocalDensity provides customDensity) {
                    var isUserLoggedIn by remember {
                        mutableStateOf(FirebaseAuth.getInstance().currentUser != null)
                    }
                    var currentScreen by remember {
                        mutableStateOf(if (isUserLoggedIn) "TODOS" else "AUTH")
                    }
                    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
                    val scope = rememberCoroutineScope()

                    ModalNavigationDrawer(
                        drawerState = drawerState,
                        drawerContent = {
                            ModalDrawerSheet(modifier = Modifier.width(280.dp).fillMaxHeight()) {
                                Column(modifier = Modifier.fillMaxHeight()) {
                                    Text(
                                        "Menu",
                                        modifier = Modifier.padding(16.dp),
                                        style = MaterialTheme.typography.titleLarge
                                    )
                                    HorizontalDivider()
                                    Spacer(modifier = Modifier.height(8.dp))

                                    if (isUserLoggedIn) {
                                        NavigationDrawerItem(
                                            icon = { Icon(Icons.Default.CheckCircle, contentDescription = null) },
                                            label = { Text("Todos") },
                                            selected = currentScreen == "TODOS",
                                            onClick = {
                                                currentScreen = "TODOS"
                                                scope.launch { drawerState.close() }
                                            },
                                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                                        )
                                        NavigationDrawerItem(
                                            icon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                            label = { Text("Vault") },
                                            selected = currentScreen == "VAULT",
                                            onClick = {
                                                currentScreen = "VAULT"
                                                scope.launch { drawerState.close() }
                                            },
                                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                                        )
                                        Spacer(modifier = Modifier.weight(1f))
                                        NavigationDrawerItem(
                                            icon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null) },
                                            label = { Text("Sign Out") },
                                            selected = false,
                                            onClick = {
                                                FirebaseAuth.getInstance().signOut()
                                                isUserLoggedIn = false
                                                currentScreen = "AUTH"
                                                scope.launch { drawerState.close() }
                                            },
                                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                                        )
                                    } else {
                                        NavigationDrawerItem(
                                            icon = { Icon(Icons.Default.AccountCircle, contentDescription = null) },
                                            label = { Text("Login / Sign Up") },
                                            selected = currentScreen == "AUTH",
                                            onClick = {
                                                currentScreen = "AUTH"
                                                scope.launch { drawerState.close() }
                                            },
                                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
                                        )
                                    }
                                }
                            }
                        }
                    ) {
                        Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                            val currentUser = FirebaseAuth.getInstance().currentUser
                            if (isUserLoggedIn && currentUser != null) {
                                if (currentScreen == "VAULT") {
                                    VaultScreen(
                                        userId = currentUser.uid,
                                        onOpenDrawer = { scope.launch { drawerState.open() } },
                                        modifier = Modifier.padding(innerPadding)
                                    )
                                } else {
                                    TodoListScreen(
                                        userId = currentUser.uid,
                                        uiScale = globalUiScale,
                                        onUiScaleChange = { globalUiScale = it },
                                        onOpenDrawer = { scope.launch { drawerState.open() } },
                                        modifier = Modifier.padding(innerPadding)
                                    )
                                }
                            } else {
                                AuthScreen(
                                    modifier = Modifier.padding(innerPadding),
                                    onAuthSuccess = {
                                        isUserLoggedIn = true
                                        currentScreen = "TODOS"
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
