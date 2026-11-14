package com.lh.eap.architecture;

import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import javax.tools.ToolProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.devtools.restart.classloader.RestartClassLoader;

import static org.junit.jupiter.api.Assertions.*;

/** Exercises IDEA's caller-loader Class.forName boundary without IDEA, a JVM fork or application startup. */
class DevToolsIdeaLauncherTest {
    private static final String WRAPPER = "com.intellij.rt.execution.application.AppMainV2";
    private static final String APPLICATION = "probe.Application";
    private static final String REGISTRY = CapabilityHandlerRegistry.class.getName();
    @TempDir Path temporary;

    @Test void launcherAndApplicationTypesStayInTheRestartLoader() throws Exception {
        Path launcherClasses = Files.createDirectories(temporary.resolve("launcher"));
        Path applicationClasses = Files.createDirectories(temporary.resolve("application"));
        compile(launcherClasses, "AppMainV2", """
                package com.intellij.rt.execution.application;
                public class AppMainV2 {
                    public static Class<?> launch(String name) throws Exception {
                        return Class.forName(name);
                    }
                }
                """);
        compile(applicationClasses, "Application", """
                package probe;
                public class Application {
                    public static Class<?> registryType() {
                        return com.lh.eap.runtime.handler.CapabilityHandlerRegistry.class;
                    }
                }
                """);
        Path launcherJar = temporary.resolve("idea_rt.jar");
        try (var jar = new JarOutputStream(Files.newOutputStream(launcherJar))) {
            jar.putNextEntry(new JarEntry(WRAPPER.replace('.', '/') + ".class"));
            Files.copy(launcherClasses.resolve(WRAPPER.replace('.', '/') + ".class"), jar);
            jar.closeEntry();
        }
        URL launcher = launcherJar.toUri().toURL();
        URL application = applicationClasses.toUri().toURL();
        URL core = CapabilityHandlerRegistry.class.getProtectionDomain().getCodeSource().getLocation();
        try (var base = new URLClassLoader(new URL[] {launcher, application}, getClass().getClassLoader())) {
            // Original failure: the wrapper stays in base and ignores the restart thread context loader.
            try (var broken = new RestartClassLoader(base, new URL[] {application, core})) {
                Class<?> host = launch(broken);
                assertSame(base, host.getClassLoader());
                assertNotSame(host.getMethod("registryType").invoke(null), broken.loadClass(REGISTRY));
            }
            // Use DevTools' real URL selection and the production META-INF/spring-devtools.properties.
            URL[] selected = restartUrls(launcher, application, core);
            assertTrue(List.of(selected).contains(launcher), "IDEA launcher must be included in restart URLs");
            try (var restart = new RestartClassLoader(base, selected)) {
                Class<?> host = launch(restart);
                assertSame(restart, restart.loadClass(WRAPPER).getClassLoader());
                assertSame(restart, host.getClassLoader());
                assertSame(restart.loadClass(REGISTRY), host.getMethod("registryType").invoke(null));
                assertSame(restart, restart.loadClass(REGISTRY).getClassLoader());
            }
        }
    }

    private Class<?> launch(ClassLoader loader) throws Exception {
        Thread thread = Thread.currentThread();
        ClassLoader previous = thread.getContextClassLoader();
        try {
            thread.setContextClassLoader(loader);
            return (Class<?>) loader.loadClass(WRAPPER).getMethod("launch", String.class)
                    .invoke(null, APPLICATION);
        } finally {
            thread.setContextClassLoader(previous);
        }
    }

    private URL[] restartUrls(URL... candidates) throws Exception {
        Class<?> selector = Class.forName("org.springframework.boot.devtools.restart.ChangeableUrls");
        var factory = selector.getDeclaredMethod("fromUrls", URL[].class);
        factory.setAccessible(true);
        var selected = new ArrayList<URL>();
        for (Object url : (Iterable<?>) factory.invoke(null, (Object) candidates)) selected.add((URL) url);
        return selected.toArray(URL[]::new);
    }

    private void compile(Path output, String name, String source) throws Exception {
        Path file = temporary.resolve(name + ".java");
        Files.writeString(file, source);
        var compiler = ToolProvider.getSystemJavaCompiler();
        assertNotNull(compiler, "The supported JDK must include javac");
        // Surefire may expose its classpath through a manifest-only bootstrap jar.
        String classpath = Path.of(CapabilityHandlerRegistry.class.getProtectionDomain().getCodeSource()
                .getLocation().toURI()).toString();
        assertEquals(0, compiler.run(null, null, null, "-classpath", classpath,
                "-d", output.toString(), file.toString()), "Compile portable launcher fixture");
    }
}
