package com.arjun.arjundubey

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import com.arjun.arjundubey.ui.theme.ArjundubeyTheme
import com.google.firebase.auth.FirebaseAuth

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
                    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                        var isUserLoggedIn by remember {
                            mutableStateOf(FirebaseAuth.getInstance().currentUser != null)
                        }

                        if (isUserLoggedIn) {
                            val currentUser = FirebaseAuth.getInstance().currentUser
                            if (currentUser != null) {
                                TodoListScreen(
                                    userId = currentUser.uid,
                                    uiScale = globalUiScale,
                                    onUiScaleChange = { globalUiScale = it },
                                    onSignOut = {
                                        FirebaseAuth.getInstance().signOut()
                                        isUserLoggedIn = false
                                    },
                                    modifier = Modifier.padding(innerPadding)
                                )
                            }
                        } else {
                            AuthScreen(
                                modifier = Modifier.padding(innerPadding),
                                onAuthSuccess = { isUserLoggedIn = true }
                            )
                        }
                    }
                }
            }
        }
    }
}
